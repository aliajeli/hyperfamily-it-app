#pragma once
#include <algorithm>
#include <cwctype>
#include <string>
#include <vector>
#include "inventory_json.hpp"

// The command/result protocol between the desktop application and the agent.
//
// The desktop drops tiny `key=value` command files into `data\commands` over
// the same SMB share the heartbeat uses; the agent executes them and answers
// with an atomic JSON file in `data\results`. Deliberately minimal: only a
// fixed whitelist of actions is ever executed, everything else is refused and
// reported back as an error result.

namespace hf {

struct AgentCommand {
    std::wstring id;
    std::wstring action;   // status | close | install
    std::wstring path;     // install target; ignored for other actions
};

struct AgentProcess {
    std::wstring name;
    unsigned long pid = 0;
};

inline std::wstring toLower(std::wstring value) {
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) { return static_cast<wchar_t>(std::towlower(ch)); });
    return value;
}

inline std::wstring trimW(const std::wstring& value) {
    const auto first = value.find_first_not_of(L" \t\r\n");
    if (first == std::wstring::npos) return L"";
    const auto last = value.find_last_not_of(L" \t\r\n");
    return value.substr(first, last - first + 1);
}

/** Parses the `key=value` lines of a command file. Unknown keys are ignored. */
inline AgentCommand parseCommand(const std::wstring& text) {
    AgentCommand command;
    std::size_t start = 0;
    while (start <= text.size()) {
        const auto end = text.find(L'\n', start);
        std::wstring line = text.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start);
        start = end == std::wstring::npos ? text.size() + 1 : end + 1;
        const auto separator = line.find(L'=');
        if (separator == std::wstring::npos) continue;
        const std::wstring key = toLower(trimW(line.substr(0, separator)));
        const std::wstring value = trimW(line.substr(separator + 1));
        if (key == L"id") command.id = value;
        else if (key == L"action") command.action = toLower(value);
        else if (key == L"path") command.path = value;
    }
    return command;
}

/** Command ids become file names in data\results, so they must stay plain. */
inline bool isSafeCommandId(const std::wstring& id) {
    if (id.empty() || id.size() > 64) return false;
    return std::all_of(id.begin(), id.end(), [](wchar_t ch) {
        return (ch >= L'a' && ch <= L'z') || (ch >= L'A' && ch <= L'Z') || (ch >= L'0' && ch <= L'9') || ch == L'.' || ch == L'_' || ch == L'-';
    });
}

/** True for the Store Commerce retail process, never for its installer or this agent. */
inline bool isStoreCommerceProcess(const std::wstring& imageName) {
    const std::wstring name = toLower(imageName);
    return name.find(L"storecommerce") != std::wstring::npos &&
        name.find(L"installer") == std::wstring::npos &&
        name.find(L"hyperfamily") == std::wstring::npos;
}

/** The JSON answer written to data\results\<id>.json. */
inline std::string commandResultJson(const std::wstring& id, const std::wstring& action, bool ok,
    const std::vector<AgentProcess>& processes, const std::wstring& version,
    const std::wstring& output, long exitCode, bool timedOut, const std::wstring& error,
    const std::wstring& at) {
    std::string out = "{\"protocolVersion\":1,\"id\":" + jsonString(id) + ",\"action\":" + jsonString(action) +
        ",\"ok\":" + (ok ? "true" : "false") + ",\"running\":" + (processes.empty() ? "false" : "true") +
        ",\"closed\":" + (processes.empty() ? "true" : "false") + ",\"processes\":[";
    bool first = true;
    for (const auto& process : processes) {
        if (!first) out += ',';
        first = false;
        out += "{\"name\":" + jsonString(process.name) + ",\"pid\":" + std::to_string(process.pid) + '}';
    }
    out += "],\"version\":" + (version.empty() ? std::string("null") : jsonString(version)) +
        ",\"output\":" + (output.empty() ? std::string("null") : jsonString(output)) +
        ",\"exitCode\":" + (exitCode < 0 ? std::string("null") : std::to_string(exitCode)) +
        ",\"timedOut\":" + (timedOut ? "true" : "false") +
        ",\"error\":" + (error.empty() ? std::string("null") : jsonString(error)) +
        ",\"at\":" + jsonString(at) + '}';
    return out;
}

} // namespace hf
