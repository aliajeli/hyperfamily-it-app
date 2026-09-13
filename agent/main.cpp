#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <shellapi.h>
#include <objbase.h>
#include <tlhelp32.h>
#include <algorithm>
#include <cwchar>
#include <cwctype>
#include <stdexcept>
#include <utility>
#include <vector>
#include "inventory_json.hpp"
#include "command_protocol.hpp"
#include "agent_version.hpp"

namespace {
constexpr wchar_t serviceName[] = L"HyperFamilyStoreAgent";
constexpr wchar_t uninstallPath[] = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
constexpr DWORD heartbeatMs = 15000;
constexpr DWORD maxValueBytes = 2 * 1024 * 1024;
constexpr std::size_t maxSnapshotBytes = 8 * 1024 * 1024;

struct WinError : std::runtime_error {
    DWORD code;
    explicit WinError(DWORD value) : std::runtime_error("Windows agent operation failed"), code(value) {}
};
struct StopRequested {};
class Handle {
    HANDLE value_;
public:
    explicit Handle(HANDLE value = INVALID_HANDLE_VALUE) : value_(value) {}
    ~Handle() { close(); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    HANDLE get() const { return value_; }
    void close() { if (value_ && value_ != INVALID_HANDLE_VALUE) CloseHandle(value_); value_ = INVALID_HANDLE_VALUE; }
};
class RegistryKey {
public:
    HKEY value = nullptr;
    ~RegistryKey() { if (value) RegCloseKey(value); }
    RegistryKey() = default;
    RegistryKey(const RegistryKey&) = delete;
    RegistryKey& operator=(const RegistryKey&) = delete;
};
void throwUnlessSuccess(LSTATUS result) {
    if (result != ERROR_SUCCESS) throw WinError(static_cast<DWORD>(result));
}
bool missing(LSTATUS result) { return result == ERROR_FILE_NOT_FOUND || result == ERROR_KEY_DELETED; }
void checkStop(HANDLE event) {
    if (event && WaitForSingleObject(event, 0) == WAIT_OBJECT_0) throw StopRequested{};
}
std::wstring trim(std::wstring value) {
    const auto first = value.find_first_not_of(L" \t\r\n\v\f\u00a0");
    if (first == std::wstring::npos) return L"";
    return value.substr(first, value.find_last_not_of(L" \t\r\n\v\f\u00a0") - first + 1);
}
std::wstring readString(HKEY key, const wchar_t* name) {
    for (int attempt = 0; attempt < 3; ++attempt) {
        DWORD type = 0, size = 0;
        LSTATUS result = RegQueryValueExW(key, name, nullptr, &type, nullptr, &size);
        if (missing(result)) return L"";
        throwUnlessSuccess(result);
        if (type != REG_SZ && type != REG_EXPAND_SZ) return L"";
        if (size > maxValueBytes || size % sizeof(wchar_t)) throw WinError(ERROR_INVALID_DATA);
        std::vector<wchar_t> buffer(size / sizeof(wchar_t) + 1, L'\0');
        result = RegQueryValueExW(key, name, nullptr, &type, reinterpret_cast<BYTE*>(buffer.data()), &size);
        if (result == ERROR_MORE_DATA) continue; // An installer may have changed it between calls.
        if (missing(result)) return L"";
        throwUnlessSuccess(result);
        if ((type != REG_SZ && type != REG_EXPAND_SZ) || size % sizeof(wchar_t)) throw WinError(ERROR_INVALID_DATA);
        buffer[size / sizeof(wchar_t)] = L'\0';
        std::wstring value(buffer.data());
        if (type == REG_EXPAND_SZ) {
            DWORD count = ExpandEnvironmentStringsW(value.c_str(), nullptr, 0);
            if (!count || count > maxValueBytes / sizeof(wchar_t)) throw WinError(ERROR_INVALID_DATA);
            std::vector<wchar_t> expanded(count, L'\0');
            const DWORD written = ExpandEnvironmentStringsW(value.c_str(), expanded.data(), count);
            if (!written || written > count) throw WinError(ERROR_INVALID_DATA);
            value.assign(expanded.data());
        }
        return trim(std::move(value));
    }
    throw WinError(ERROR_MORE_DATA);
}
int compareOrdinal(const std::wstring& a, const std::wstring& b) {
    const int result = CompareStringOrdinal(a.c_str(), static_cast<int>(a.size()), b.c_str(), static_cast<int>(b.size()), TRUE);
    if (!result) throw WinError(GetLastError());
    return result - CSTR_EQUAL;
}
std::vector<hf::InstalledProgram> readPrograms(HANDLE stopEvent) {
    std::vector<hf::InstalledProgram> programs;
    // Both machine registry views, never HKCU, Win32_Product, WMI or the network.
    for (const REGSAM view : {REGSAM(KEY_WOW64_64KEY), REGSAM(KEY_WOW64_32KEY)}) {
        checkStop(stopEvent);
        RegistryKey uninstall;
        const LSTATUS opened = RegOpenKeyExW(HKEY_LOCAL_MACHINE, uninstallPath, 0, KEY_READ | view, &uninstall.value);
        if (missing(opened)) continue;
        throwUnlessSuccess(opened);
        for (DWORD index = 0; ; ++index) {
            checkStop(stopEvent);
            wchar_t name[256]{};
            DWORD count = 256;
            const LSTATUS enumerated = RegEnumKeyExW(uninstall.value, index, name, &count, nullptr, nullptr, nullptr, nullptr);
            if (enumerated == ERROR_NO_MORE_ITEMS) break;
            throwUnlessSuccess(enumerated);
            RegistryKey key;
            const LSTATUS result = RegOpenKeyExW(uninstall.value, name, 0, KEY_QUERY_VALUE | view, &key.value);
            if (missing(result)) continue;
            throwUnlessSuccess(result);
            auto displayName = readString(key.value, L"DisplayName");
            if (displayName.empty()) continue;
            programs.push_back({std::wstring(view == KEY_WOW64_64KEY ? L"Registry64\\" : L"Registry32\\") + name,
                std::move(displayName), readString(key.value, L"DisplayVersion"), readString(key.value, L"Publisher"), readString(key.value, L"InstallLocation")});
            if (programs.size() > 20000) throw WinError(ERROR_BUFFER_OVERFLOW);
        }
    }
    std::sort(programs.begin(), programs.end(), [](const auto& a, const auto& b) {
        const int name = compareOrdinal(a.name, b.name);
        return name < 0 || (name == 0 && compareOrdinal(a.version, b.version) < 0);
    });
    programs.erase(std::unique(programs.begin(), programs.end(), [](const auto& a, const auto& b) {
        return compareOrdinal(a.name, b.name) == 0 && compareOrdinal(a.version, b.version) == 0;
    }), programs.end());
    return programs;
}
std::wstring newId() {
    GUID id{};
    if (FAILED(CoCreateGuid(&id))) throw WinError(ERROR_GEN_FAILURE);
    wchar_t text[40]{};
    if (!StringFromGUID2(id, text, 40)) throw WinError(ERROR_GEN_FAILURE);
    std::wstring value(text);
    value.erase(std::remove_if(value.begin(), value.end(), [](wchar_t ch) { return ch == L'{' || ch == L'}' || ch == L'-'; }), value.end());
    return value;
}
std::wstring utcNow() {
    SYSTEMTIME now{};
    GetSystemTime(&now);
    wchar_t buffer[40]{};
    std::swprintf(buffer, 40, L"%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",
        static_cast<unsigned>(now.wYear), static_cast<unsigned>(now.wMonth), static_cast<unsigned>(now.wDay),
        static_cast<unsigned>(now.wHour), static_cast<unsigned>(now.wMinute), static_cast<unsigned>(now.wSecond), static_cast<unsigned>(now.wMilliseconds));
    return buffer;
}
std::wstring machineName() {
    wchar_t buffer[MAX_COMPUTERNAME_LENGTH + 1]{};
    DWORD count = MAX_COMPUTERNAME_LENGTH + 1;
    if (!GetComputerNameW(buffer, &count)) throw WinError(GetLastError());
    return std::wstring(buffer, count);
}
std::wstring executableDirectory() {
    std::vector<wchar_t> buffer(32768, L'\0');
    const DWORD count = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (!count || count >= buffer.size()) throw WinError(ERROR_INVALID_NAME);
    const std::wstring filename(buffer.data(), count);
    const auto separator = filename.find_last_of(L"\\/");
    if (separator == std::wstring::npos) throw WinError(ERROR_INVALID_NAME);
    return filename.substr(0, separator);
}
void ensureDirectory(const std::wstring& directory) {
    if (!CreateDirectoryW(directory.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) throw WinError(GetLastError());
    const DWORD attributes = GetFileAttributesW(directory.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY) || (attributes & FILE_ATTRIBUTE_REPARSE_POINT)) throw WinError(ERROR_ACCESS_DENIED);
}
void writeBytes(HANDLE file, const std::string& bytes) {
    DWORD offset = 0;
    while (offset < bytes.size()) {
        DWORD written = 0;
        if (!WriteFile(file, bytes.data() + offset, static_cast<DWORD>(bytes.size() - offset), &written, nullptr)) throw WinError(GetLastError());
        if (!written) throw WinError(ERROR_WRITE_FAULT);
        offset += written;
    }
}
void writeAtomicFile(const std::wstring& directory, const std::wstring& destination, const std::string& bytes) {
    if (bytes.size() > maxSnapshotBytes) throw WinError(ERROR_BUFFER_OVERFLOW);
    const std::wstring temporary = directory + L"\\" + destination + L"-" + newId() + L".tmp";
    const std::wstring target = directory + L"\\" + destination;
    // CREATE_NEW + a unique name prevents following/replacing a pre-existing
    // temporary file. Same-directory rename publishes complete JSON atomically.
    const HANDLE raw = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (raw == INVALID_HANDLE_VALUE) throw WinError(GetLastError());
    Handle file(raw);
    try {
        writeBytes(file.get(), bytes);
        if (!FlushFileBuffers(file.get())) throw WinError(GetLastError());
        file.close();
        if (!MoveFileExW(temporary.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) throw WinError(GetLastError());
    } catch (...) {
        file.close();
        DeleteFileW(temporary.c_str());
        throw;
    }
}
void writeSnapshot(const std::wstring& directory, const std::string& bytes) {
    writeAtomicFile(directory, L"inventory.json", bytes);
}
std::string readSnapshot(const std::wstring& filename) {
    Handle file(CreateFileW(filename.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    if (file.get() == INVALID_HANDLE_VALUE) throw WinError(GetLastError());
    std::string result;
    char buffer[4096];
    DWORD count = 0;
    do {
        if (!ReadFile(file.get(), buffer, sizeof(buffer), &count, nullptr)) throw WinError(GetLastError());
        result.append(buffer, count);
        if (result.size() > maxSnapshotBytes) throw WinError(ERROR_BUFFER_OVERFLOW);
    } while (count);
    return result;
}

/* --------------------------------------------------------------------------
 * Command channel.
 *
 * The desktop application drops tiny UTF-8 `key=value` files into
 * data\commands over the same SMB share the heartbeat uses; the agent runs
 * the whitelisted action — status, close, install — and answers with an
 * atomically published JSON file in data\results. The service runs as SYSTEM
 * with automatic startup before login, so an install needs neither a signed-in
 * user nor a UAC prompt on the checkout.
 * ------------------------------------------------------------------------ */
constexpr DWORD pollIntervalMs = 1000;
constexpr DWORD heartbeatTicks = heartbeatMs / pollIntervalMs;
constexpr DWORD installTimeoutMs = 15 * 60 * 1000;
constexpr std::size_t maxCommandBytes = 8 * 1024;
constexpr std::size_t maxOutputChars = 64 * 1024;

std::wstring widenUtf8(const std::string& bytes) {
    if (bytes.empty()) return L"";
    const int count = MultiByteToWideChar(CP_UTF8, 0, bytes.data(), static_cast<int>(bytes.size()), nullptr, 0);
    if (count <= 0) throw WinError(ERROR_INVALID_DATA);
    std::wstring text(static_cast<std::size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, bytes.data(), static_cast<int>(bytes.size()), text.data(), count);
    return text;
}
std::wstring widenOem(const std::string& bytes) {
    if (bytes.empty()) return L"";
    const int count = MultiByteToWideChar(CP_OEMCP, 0, bytes.data(), static_cast<int>(bytes.size()), nullptr, 0);
    if (count <= 0) return L"";
    std::wstring text(static_cast<std::size_t>(count), L'\0');
    MultiByteToWideChar(CP_OEMCP, 0, bytes.data(), static_cast<int>(bytes.size()), text.data(), count);
    return text;
}
/** Lets SYSTEM terminate processes of other sessions/users; best effort, never fatal. */
void enableDebugPrivilege() {
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &token)) return;
    Handle handle(token);
    TOKEN_PRIVILEGES privileges{};
    privileges.PrivilegeCount = 1;
    privileges.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
    if (!LookupPrivilegeValueW(nullptr, SE_DEBUG_NAME, &privileges.Privileges[0].Luid)) return;
    AdjustTokenPrivileges(handle.get(), FALSE, &privileges, sizeof(privileges), nullptr, nullptr);
}
std::vector<hf::AgentProcess> listStoreCommerceProcesses() {
    std::vector<hf::AgentProcess> result;
    const HANDLE raw = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (raw == INVALID_HANDLE_VALUE) throw WinError(GetLastError());
    Handle snapshot(raw);
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    if (!Process32FirstW(snapshot.get(), &entry)) {
        const DWORD error = GetLastError();
        if (error != ERROR_NO_MORE_FILES) throw WinError(error);
        return result;
    }
    do {
        if (entry.th32ProcessID != GetCurrentProcessId() && hf::isStoreCommerceProcess(entry.szExeFile)) {
            result.push_back({entry.szExeFile, entry.th32ProcessID});
        }
    } while (Process32NextW(snapshot.get(), &entry));
    const DWORD error = GetLastError();
    if (error != ERROR_NO_MORE_FILES) throw WinError(error);
    if (result.size() > 256) throw WinError(ERROR_BUFFER_OVERFLOW);
    return result;
}
std::wstring storeCommerceVersion() {
    const auto programs = readPrograms(nullptr);
    for (const auto& program : programs)
        if (hf::toLower(program.name) == L"store commerce") return program.version;
    for (const auto& program : programs) {
        const auto name = hf::toLower(program.name);
        if (name.find(L"store commerce") != std::wstring::npos || name.find(L"storecommerce") != std::wstring::npos) return program.version;
    }
    return L"";
}
struct CloseWindowsContext { const std::vector<hf::AgentProcess>* processes; };
BOOL CALLBACK postCloseToWindows(HWND window, LPARAM parameter) {
    const auto& context = *reinterpret_cast<const CloseWindowsContext*>(parameter);
    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    if (!pid) return TRUE;
    const auto owned = std::any_of(context.processes->begin(), context.processes->end(),
        [pid](const hf::AgentProcess& process) { return process.pid == pid; });
    if (!owned) return TRUE;
    // Only top-level visible windows answer WM_CLOSE like a user closing them.
    if (GetWindow(window, GW_OWNER) != nullptr || !IsWindowVisible(window)) return TRUE;
    PostMessageW(window, WM_CLOSE, 0, 0);
    return TRUE;
}
/** Asks Store Commerce to close, force-stops what refuses, and returns what is
 *  still alive. The Windows error of a failed forced stop is reported through
 *  `terminateError` so the operator sees WHY instead of a bare "still running". */
std::vector<hf::AgentProcess> closeStoreCommerce(DWORD* terminateError) {
    auto processes = listStoreCommerceProcesses();
    if (processes.empty()) return processes;
    CloseWindowsContext context{&processes};
    EnumWindows(postCloseToWindows, reinterpret_cast<LPARAM>(&context));
    const ULONGLONG politeDeadline = GetTickCount64() + 15000;
    while (GetTickCount64() < politeDeadline) {
        Sleep(250);
        processes = listStoreCommerceProcesses();
        if (processes.empty()) return processes;
    }
    for (int pass = 0; pass < 2 && !processes.empty(); ++pass) {
        for (const auto& process : processes) {
            const HANDLE raw = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, FALSE, process.pid);
            if (!raw) { if (terminateError) *terminateError = GetLastError(); continue; }
            Handle handle(raw);
            if (!TerminateProcess(handle.get(), 1) && terminateError) *terminateError = GetLastError();
            WaitForSingleObject(handle.get(), 5000);
        }
        const ULONGLONG hardDeadline = GetTickCount64() + 7000;
        while (GetTickCount64() < hardDeadline) {
            Sleep(250);
            processes = listStoreCommerceProcesses();
            if (processes.empty()) break;
        }
    }
    return processes;
}
/** SHA-256 of a local file, computed ON the checkout by the agent — the desktop
 *  only receives the 64-hex digest instead of reading the whole copy back. */
std::wstring sha256FileHex(const std::wstring& path, HANDLE stopEvent) {
    BCRYPT_ALG_HANDLE provider = nullptr;
    NTSTATUS status = BCryptOpenAlgorithmProvider(&provider, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
    if (status) throw WinError(static_cast<DWORD>(status));
    struct ProviderGuard { BCRYPT_ALG_HANDLE value; ~ProviderGuard() { if (value) BCryptCloseAlgorithmProvider(value, 0); } } providerGuard{provider};
    BCRYPT_HASH_HANDLE hash = nullptr;
    status = BCryptCreateHash(provider, &hash, nullptr, 0, nullptr, 0, 0);
    if (status) throw WinError(static_cast<DWORD>(status));
    struct HashGuard { BCRYPT_HASH_HANDLE value; ~HashGuard() { if (value) BCryptDestroyHash(value); } } hashGuard{hash};
    const HANDLE raw = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (raw == INVALID_HANDLE_VALUE) throw WinError(GetLastError());
    Handle file(raw);
    std::vector<unsigned char> buffer(1024 * 1024);
    DWORD count = 0;
    while (true) {
        if (!ReadFile(file.get(), buffer.data(), static_cast<DWORD>(buffer.size()), &count, nullptr)) throw WinError(GetLastError());
        if (!count) break;
        checkStop(stopEvent);
        status = BCryptHashData(hash, buffer.data(), count, 0);
        if (status) throw WinError(static_cast<DWORD>(status));
    }
    unsigned char digest[32]{};
    status = BCryptFinishHash(hash, digest, sizeof(digest), 0);
    if (status) throw WinError(static_cast<DWORD>(status));
    constexpr wchar_t digits[] = L"0123456789abcdef";
    std::wstring hex;
    hex.reserve(64);
    for (const unsigned char byte : digest) { hex += digits[byte >> 4]; hex += digits[byte & 15]; }
    return hex;
}
struct InstallOutcome {
    long exitCode = -1;
    std::wstring output;
    bool timedOut = false;
};
/** Runs `<executable> install` invisibly, capturing everything it prints. */
InstallOutcome runInstaller(const std::wstring& executable) {
    const DWORD attributes = GetFileAttributesW(executable.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) || (attributes & FILE_ATTRIBUTE_REPARSE_POINT)) throw WinError(ERROR_FILE_NOT_FOUND);

    SECURITY_ATTRIBUTES inheritable{sizeof(inheritable), nullptr, TRUE};
    HANDLE readRaw = INVALID_HANDLE_VALUE;
    HANDLE writeRaw = INVALID_HANDLE_VALUE;
    if (!CreatePipe(&readRaw, &writeRaw, &inheritable, 0)) throw WinError(GetLastError());
    Handle readEnd(readRaw);
    Handle writeEnd(writeRaw);
    if (!SetHandleInformation(readEnd.get(), HANDLE_FLAG_INHERIT, 0)) throw WinError(GetLastError());

    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdOutput = writeEnd.get();
    startup.hStdError = writeEnd.get();
    startup.hStdInput = nullptr;

    std::wstring commandLine = L"\"" + executable + L"\" install";
    std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
    mutableCommand.push_back(L'\0');
    const auto separator = executable.find_last_of(L"\\/");
    const std::wstring workingDirectory = separator == std::wstring::npos ? std::wstring() : executable.substr(0, separator);

    PROCESS_INFORMATION information{};
    if (!CreateProcessW(executable.c_str(), mutableCommand.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr,
            workingDirectory.empty() ? nullptr : workingDirectory.c_str(), &startup, &information)) throw WinError(GetLastError());
    Handle process(information.hProcess);
    Handle thread(information.hThread);
    // The parent must release the write end, otherwise the reader never sees EOF.
    writeEnd.close();

    InstallOutcome outcome;
    std::string captured;
    char buffer[4096];
    const ULONGLONG deadline = GetTickCount64() + installTimeoutMs;
    while (true) {
        DWORD available = 0;
        if (!PeekNamedPipe(readEnd.get(), nullptr, 0, nullptr, &available, nullptr)) break; // installer closed the pipe
        if (available) {
            DWORD count = 0;
            const DWORD wanted = available < sizeof(buffer) ? available : sizeof(buffer);
            if (!ReadFile(readEnd.get(), buffer, wanted, &count, nullptr) || !count) break;
            if (captured.size() < maxOutputChars) captured.append(buffer, std::min<std::size_t>(count, maxOutputChars - captured.size()));
            continue;
        }
        if (WaitForSingleObject(process.get(), 0) == WAIT_OBJECT_0) break;
        if (GetTickCount64() > deadline) {
            TerminateProcess(process.get(), 1);
            WaitForSingleObject(process.get(), 10000);
            outcome.timedOut = true;
            break;
        }
        Sleep(100);
    }
    DWORD count = 0;
    while (ReadFile(readEnd.get(), buffer, sizeof(buffer), &count, nullptr) && count) {
        if (captured.size() < maxOutputChars) captured.append(buffer, std::min<std::size_t>(count, maxOutputChars - captured.size()));
    }
    DWORD exitCode = 0;
    if (!GetExitCodeProcess(process.get(), &exitCode)) throw WinError(GetLastError());
    outcome.exitCode = static_cast<long>(exitCode);
    outcome.output = widenOem(captured);
    return outcome;
}
void writeFailureResult(const std::wstring& results, const std::wstring& id, const std::wstring& action, DWORD code) {
    if (!hf::isSafeCommandId(id)) return;
    try {
        wchar_t message[512]{};
        std::swprintf(message, 512, L"Agent command failed with Windows error %lu", code);
        writeAtomicFile(results, id + L".json", hf::commandResultJson(id, action, false, {}, L"", L"", -1, false, message, utcNow()));
    } catch (...) { /* an undeliverable failure answer must never stop the service */ }
}
/** Executes every pending command file; called once per second by the service loop. */
void pollCommands(const std::wstring& dataDirectory, HANDLE stopEvent) {
    const std::wstring commands = dataDirectory + L"\\commands";
    const std::wstring results = dataDirectory + L"\\results";
    ensureDirectory(commands);
    ensureDirectory(results);
    WIN32_FIND_DATAW found{};
    const HANDLE search = FindFirstFileW((commands + L"\\*.cmd").c_str(), &found);
    if (search == INVALID_HANDLE_VALUE) return;
    std::vector<std::wstring> files;
    do {
        if (!(found.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) files.emplace_back(found.cFileName);
    } while (FindNextFileW(search, &found));
    FindClose(search);
    if (files.size() > 64) files.resize(64);
    for (const auto& fileName : files) {
        const std::wstring stem = fileName.size() > 4 ? fileName.substr(0, fileName.size() - 4) : fileName;
        std::wstring id = stem;
        std::wstring action;
        try {
            const auto text = readSnapshot(commands + L"\\" + fileName);
            if (text.size() > maxCommandBytes) throw WinError(ERROR_BUFFER_OVERFLOW);
            const auto command = hf::parseCommand(widenUtf8(text));
            if (!command.id.empty()) id = command.id;
            if (!hf::isSafeCommandId(id)) throw WinError(ERROR_INVALID_NAME);
            action = command.action;
            std::vector<hf::AgentProcess> processes;
            std::wstring version;
            std::wstring output;
            std::wstring error;
            std::wstring sha;
            long exitCode = -1;
            bool timedOut = false;
            bool ok = true;
            if (action == L"status") {
                processes = listStoreCommerceProcesses();
                version = storeCommerceVersion();
            } else if (action == L"close") {
                DWORD terminateError = 0;
                processes = closeStoreCommerce(&terminateError);
                version = storeCommerceVersion();
                ok = processes.empty();
                if (!ok) error = terminateError
                    ? L"Store Commerce is still running; forcing it to stop failed with Windows error " + std::to_wstring(terminateError)
                    : L"Store Commerce is still running after a forced stop";
            } else if (action == L"sha256") {
                // Destination-side hash: the desktop only gets the digest back.
                if (command.path.size() < 5 || command.path[1] != L':') throw WinError(ERROR_INVALID_NAME);
                sha = sha256FileHex(command.path, stopEvent);
            } else if (action == L"install") {
                if (command.path.size() < 5 || command.path[1] != L':') throw WinError(ERROR_INVALID_NAME);
                const auto lowered = hf::toLower(command.path);
                if (lowered.compare(lowered.size() - 4, 4, L".exe") != 0) throw WinError(ERROR_INVALID_NAME);
                const auto outcome = runInstaller(command.path);
                exitCode = outcome.exitCode;
                output = outcome.output;
                timedOut = outcome.timedOut;
                version = storeCommerceVersion();
                processes = listStoreCommerceProcesses();
                ok = !timedOut && exitCode == 0;
                if (!ok) error = timedOut ? L"The installer did not finish within 15 minutes and was stopped"
                    : L"The installer exited with code " + std::to_wstring(exitCode);
            } else {
                ok = false;
                error = L"Unsupported action \"" + action + L"\"";
            }
            writeAtomicFile(results, id + L".json", hf::commandResultJson(id, action.empty() ? stem : action, ok, processes, version, output, exitCode, timedOut, error, utcNow(), sha));
        } catch (const WinError& failure) {
            writeFailureResult(results, id, action, failure.code);
        } catch (...) {
            writeFailureResult(results, id, action, ERROR_GEN_FAILURE);
        }
        DeleteFileW((commands + L"\\" + fileName).c_str());
    }
}

struct ServiceContext {
    SERVICE_STATUS_HANDLE statusHandle = nullptr;
    SERVICE_STATUS status{};
    SRWLOCK lock = SRWLOCK_INIT;
    HANDLE stopEvent = nullptr;
    void report(DWORD state, DWORD error = NO_ERROR) {
        AcquireSRWLockExclusive(&lock);
        if (status.dwCurrentState == SERVICE_STOPPED && state != SERVICE_STOPPED) { ReleaseSRWLockExclusive(&lock); return; }
        status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
        status.dwCurrentState = state;
        status.dwControlsAccepted = state == SERVICE_RUNNING ? SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN : 0;
        status.dwWin32ExitCode = error;
        status.dwWaitHint = state == SERVICE_START_PENDING || state == SERVICE_STOP_PENDING ? 10000 : 0;
        status.dwCheckPoint = status.dwWaitHint ? status.dwCheckPoint + 1 : 0;
        SetServiceStatus(statusHandle, &status);
        ReleaseSRWLockExclusive(&lock);
    }
    void repeatStatus() {
        AcquireSRWLockExclusive(&lock);
        SetServiceStatus(statusHandle, &status);
        ReleaseSRWLockExclusive(&lock);
    }
} service;
DWORD WINAPI controlHandler(DWORD control, DWORD, LPVOID, LPVOID) {
    if (control == SERVICE_CONTROL_STOP || control == SERVICE_CONTROL_SHUTDOWN) {
        service.report(SERVICE_STOP_PENDING);
        SetEvent(service.stopEvent);
        return NO_ERROR;
    }
    if (control == SERVICE_CONTROL_INTERROGATE) { service.repeatStatus(); return NO_ERROR; }
    return ERROR_CALL_NOT_IMPLEMENTED;
}
void WINAPI serviceMain(DWORD, LPWSTR*) {
    service.statusHandle = RegisterServiceCtrlHandlerExW(serviceName, controlHandler, nullptr);
    if (!service.statusHandle) return;
    service.report(SERVICE_START_PENDING);
    enableDebugPrivilege();
    DWORD exitCode = NO_ERROR;
    std::wstring directory;
    try {
        directory = executableDirectory() + L"\\data";
        ensureDirectory(directory);
        const auto instance = newId();
        const auto machine = machineName();
        std::uint64_t sequence = 0;
        service.report(SERVICE_RUNNING);
        DWORD tick = 0;
        while (WaitForSingleObject(service.stopEvent, 0) != WAIT_OBJECT_0) {
            try {
                // Commands first: the operator's pipeline waits for these, the
                // heartbeat may lag a second behind. A broken command file
                // must never stop the inventory heartbeat.
                try { pollCommands(directory, service.stopEvent); } catch (...) { }
                if (tick % heartbeatTicks == 0) {
                    std::vector<hf::InstalledProgram> programs;
                    std::wstring error;
                    try { programs = readPrograms(service.stopEvent); }
                    catch (const WinError&) { error = L"The agent could not read the local uninstall registry. Check service permissions."; }
                    checkStop(service.stopEvent);
                    auto json = hf::snapshotJson(hf::agentVersion, machine, GetCurrentProcessId(), instance, ++sequence, utcNow(), programs, error);
                    if (json.size() > maxSnapshotBytes) json = hf::snapshotJson(hf::agentVersion, machine, GetCurrentProcessId(), instance, sequence, utcNow(), {}, L"The local inventory exceeds the supported size limit.");
                    writeSnapshot(directory, json);
                }
            } catch (const StopRequested&) { break; }
            catch (...) { /* Failed writes stop heartbeat advancement; never claim stale data is fresh. */ }
            tick += 1;
            if (WaitForSingleObject(service.stopEvent, pollIntervalMs) == WAIT_OBJECT_0) break;
        }
    } catch (const WinError& error) { exitCode = error.code; }
    catch (...) { exitCode = ERROR_GEN_FAILURE; }
    if (!directory.empty()) DeleteFileW((directory + L"\\inventory.json").c_str());
    service.report(SERVICE_STOPPED, exitCode);
}
int selfTest() {
    std::wstring directory;
    try {
        wchar_t temporary[32768]{};
        const DWORD count = GetTempPathW(32768, temporary);
        if (!count || count >= 32768) throw WinError(ERROR_INVALID_NAME);
        directory = std::wstring(temporary) + L"HyperFamilyAgentTest-" + newId();
        ensureDirectory(directory);
        auto programs = readPrograms(nullptr);
        programs.push_back({L"SelfTest", L"HyperFamily \"Self-test\" \u0641\u0627\u0631\u0633\u06cc \U0001f600", L"8.0", L"line1\nline2\t", L"C:\\Agent\\test"});
        std::string json;
        for (std::uint64_t sequence = 1; sequence <= 2; ++sequence) {
            json = hf::snapshotJson(hf::agentVersion, machineName(), GetCurrentProcessId(), L"self-test", sequence, utcNow(), programs);
            writeSnapshot(directory, json);
            if (readSnapshot(directory + L"\\inventory.json") != json) throw WinError(ERROR_CRC);
        }
        DeleteFileW((directory + L"\\inventory.json").c_str());
        // Known-answer SHA-256: the CNG implementation must match RFC 6234.
        const std::wstring shaFile = directory + L"\\sha.txt";
        const HANDLE shaHandle = CreateFileW(shaFile.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (shaHandle == INVALID_HANDLE_VALUE) throw WinError(GetLastError());
        { Handle file(shaHandle); writeBytes(file.get(), "abc"); }
        const auto digest = sha256FileHex(shaFile, nullptr);
        DeleteFileW(shaFile.c_str());
        if (digest != L"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw WinError(ERROR_CRC);
        if (!RemoveDirectoryW(directory.c_str())) throw WinError(GetLastError());
        directory.clear();
        const HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
        if (output && output != INVALID_HANDLE_VALUE) writeBytes(output, json);
        return 0;
    } catch (...) {
        if (!directory.empty()) { DeleteFileW((directory + L"\\inventory.json").c_str()); RemoveDirectoryW(directory.c_str()); }
        return 1;
    }
}
} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    int count = 0;
    LPWSTR* args = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!args) return static_cast<int>(GetLastError());
    const bool test = count == 2 && std::wcscmp(args[1], L"--self-test") == 0;
    LocalFree(args);
    if (test) return selfTest();
    if (count != 1) return ERROR_INVALID_PARAMETER;
    Handle stop(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    if (!stop.get() || stop.get() == INVALID_HANDLE_VALUE) return static_cast<int>(GetLastError());
    service.stopEvent = stop.get();
    SERVICE_TABLE_ENTRYW table[] = {{const_cast<LPWSTR>(serviceName), serviceMain}, {nullptr, nullptr}};
    if (!StartServiceCtrlDispatcherW(table)) return static_cast<int>(GetLastError());
    return static_cast<int>(service.status.dwWin32ExitCode);
}
