#include "../command_protocol.hpp"
#include <iostream>
#include <stdexcept>

void expect(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
int main() {
    try {
        const auto command = hf::parseCommand(L"id=abc123\r\naction=Install\r\npath=C:\\Deploy\\Hyper.StoreCommerce.Installer.exe\r\n");
        expect(command.id == L"abc123", "id is parsed");
        expect(command.action == L"install", "action is lowercased");
        expect(command.path == L"C:\\Deploy\\Hyper.StoreCommerce.Installer.exe", "path survives backslashes");

        const auto partial = hf::parseCommand(L"action=close");
        expect(partial.action == L"close" && partial.id.empty() && partial.path.empty(), "missing keys stay empty");

        const auto spaced = hf::parseCommand(L"  ACTION = Status \n");
        expect(spaced.action == L"status", "keys and values are trimmed and keys are case-insensitive");

        const auto junk = hf::parseCommand(L"nonsense\r\naction=status\r\n=novalue\r\nnovalue=\r\n");
        expect(junk.action == L"status", "malformed lines are ignored");

        expect(hf::isSafeCommandId(L"9f8b2c-1.2_3"), "plain ids are accepted");
        expect(!hf::isSafeCommandId(L""), "empty id is refused");
        expect(!hf::isSafeCommandId(L"..\\..\\evil"), "path traversal is refused");
        expect(!hf::isSafeCommandId(std::wstring(65, L'a')), "oversized ids are refused");

        expect(hf::isStoreCommerceProcess(L"StoreCommerce.exe"), "the retail process matches");
        expect(hf::isStoreCommerceProcess(L"storecommerce.exe"), "matching ignores case");
        expect(hf::isStoreCommerceProcess(L"Hyper.StoreCommerce.vNext.exe"), "branded names match");
        expect(!hf::isStoreCommerceProcess(L"Hyper.StoreCommerce.Installer.exe"), "the installer never matches");
        expect(!hf::isStoreCommerceProcess(L"HyperFamilyStoreAgent.exe"), "this agent never matches itself");
        expect(!hf::isStoreCommerceProcess(L"explorer.exe"), "unrelated processes do not match");

        const std::vector<hf::AgentProcess> running{{L"StoreCommerce.exe", 4242}};
        const auto busy = hf::commandResultJson(L"abc123", L"status", true, running, L"9.52", L"", -1, false, L"", L"2026-09-12T00:00:00.000Z");
        expect(busy.find("\"running\":true") != std::string::npos, "a live process marks the result running");
        expect(busy.find("\"pid\":4242") != std::string::npos, "the pid is numeric");
        expect(busy.find("\"version\":\"9.52\"") != std::string::npos, "the version is quoted");
        expect(busy.find("\"exitCode\":null") != std::string::npos, "no exit code stays null");

        const auto settled = hf::commandResultJson(L"x", L"install", false, {}, L"", L"line\"1\\\n", 1603, true, L"Installer failed", L"now");
        expect(settled.find("\"running\":false") != std::string::npos && settled.find("\"closed\":true") != std::string::npos, "an empty process list settles");
        expect(settled.find("\"exitCode\":1603") != std::string::npos, "a real exit code is numeric");
        expect(settled.find("\"timedOut\":true") != std::string::npos, "a timeout is flagged");
        expect(settled.find("line\\\"1\\\\\\u000a") != std::string::npos, "output is JSON-escaped");
        expect(settled.find("\"error\":\"Installer failed\"") != std::string::npos, "errors are reported");

        std::cout << "Native agent command protocol tests passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cout << "FAILED: " << error.what() << "\n";
        return 1;
    }
}
