using Microsoft.Win32;
using System.Reflection;
using System.ServiceProcess;
using System.Text.Json;

namespace HyperFamily.StoreAgent;

internal static class Program
{
    public const string ServiceName = "HyperFamilyStoreAgent";
    public static int Main(string[] args)
    {
        if (args.Contains("--self-test")) return SelfTest.Run();
        ServiceBase.Run(new InventoryService());
        return 0;
    }
}

internal sealed class InventoryService : ServiceBase
{
    private CancellationTokenSource? stop;
    private Task? worker;
    private readonly string instanceId = Guid.NewGuid().ToString("N");
    private long sequence;
    private readonly string dataDirectory = Path.Combine(AppContext.BaseDirectory, "data");

    public InventoryService()
    {
        ServiceName = Program.ServiceName;
        CanStop = true;
        CanShutdown = true;
        AutoLog = false; // No event-source registration / administrator privileges needed.
    }

    protected override void OnStart(string[] args)
    {
        stop = new CancellationTokenSource();
        worker = Task.Run(() => RunAsync(stop.Token));
    }

    protected override void OnStop()
    {
        stop?.Cancel();
        try { worker?.GetAwaiter().GetResult(); }
        catch (OperationCanceledException) { }
        // A stopped service must not leave a apparently-live snapshot behind.
        try { File.Delete(Path.Combine(dataDirectory, "inventory.json")); } catch { }
        stop?.Dispose();
    }

    protected override void OnShutdown() => OnStop();

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    List<InstalledProgram> programs = [];
                    string? error = null;
                    try { programs = Inventory.ReadPrograms(); }
                    catch { error = "The agent could not read the local uninstall registry. Check service permissions."; }
                    var snapshot = new Snapshot(1, Inventory.Version, Environment.MachineName,
                        Environment.ProcessId, instanceId, ++sequence, DateTimeOffset.UtcNow,
                        "running", error, programs);
                    AtomicSnapshot.Write(dataDirectory, snapshot);
                }
                catch
                {
                    // An unwritable data folder stops heartbeats; the desktop detects
                    // stale data instead of showing an old version as current.
                }
                await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }
}

internal record InstalledProgram(string Key, string Name, string Version, string Publisher, string InstallLocation);
internal record Snapshot(int ProtocolVersion, string AgentVersion, string MachineName, int Pid,
    string InstanceId, long Sequence, DateTimeOffset GeneratedAt, string State,
    string? InventoryError, List<InstalledProgram> Programs);

internal static class Inventory
{
    public static string Version => typeof(Inventory).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";

    // Local HKLM only; no network access, credentials, remote commands or MSI repair.
    public static List<InstalledProgram> ReadPrograms()
    {
        var found = new Dictionary<string, InstalledProgram>(StringComparer.OrdinalIgnoreCase);
        var views = Environment.Is64BitOperatingSystem
            ? new[] { RegistryView.Registry64, RegistryView.Registry32 }
            : new[] { RegistryView.Registry32 };
        foreach (var view in views)
        {
            using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var uninstall = machine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstall is null) continue;
            foreach (var keyName in uninstall.GetSubKeyNames())
            {
                using var key = uninstall.OpenSubKey(keyName);
                if (key is null) continue; // The app may have been uninstalled during enumeration.
                string Read(string name) => Convert.ToString(key.GetValue(name))?.Trim() ?? "";
                var name = Read("DisplayName");
                if (name.Length == 0) continue;
                var version = Read("DisplayVersion");
                found.TryAdd($"{name}|{version}", new InstalledProgram($"{view}\\{keyName}", name, version, Read("Publisher"), Read("InstallLocation")));
            }
        }
        return found.Values.OrderBy(program => program.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }
}

internal static class AtomicSnapshot
{
    public static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    public static void Write(string directory, Snapshot snapshot)
    {
        Directory.CreateDirectory(directory);
        var destination = Path.Combine(directory, "inventory.json");
        var temporary = Path.Combine(directory, "inventory.json.tmp");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(snapshot, JsonOptions);
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            stream.Write(bytes);
            stream.Flush(true);
        }
        File.Move(temporary, destination, true);
    }
}

internal static class SelfTest
{
    public static int Run()
    {
        var directory = Path.Combine(Path.GetTempPath(), "hf-agent-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var programs = Inventory.ReadPrograms();
            for (var sequence = 1; sequence <= 2; sequence++)
            {
                AtomicSnapshot.Write(directory, new Snapshot(1, Inventory.Version, Environment.MachineName,
                    Environment.ProcessId, "test-instance", sequence, DateTimeOffset.UtcNow, "running", null, programs));
                using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "inventory.json")));
                if (document.RootElement.GetProperty("sequence").GetInt32() != sequence ||
                    document.RootElement.GetProperty("protocolVersion").GetInt32() != 1 ||
                    document.RootElement.GetProperty("programs").ValueKind != JsonValueKind.Array)
                    throw new Exception("Invalid agent snapshot");
            }
            if (File.Exists(Path.Combine(directory, "inventory.json.tmp"))) throw new Exception("Snapshot was not atomically published");
            return 0;
        }
        catch { return 1; }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
