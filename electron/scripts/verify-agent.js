const fs = require('fs')
const crypto = require('crypto')

const MAX_AGENT_BYTES = 2 * 1024 * 1024
function inspectPe(buffer) {
  const requireBytes = (offset, count) => {
    if (!Number.isInteger(offset) || offset < 0 || offset + count > buffer.length) throw new Error('Invalid agent PE bounds')
  }
  requireBytes(0, 64)
  if (buffer.toString('ascii', 0, 2) !== 'MZ') throw new Error('Agent is not a Windows executable')
  const pe = buffer.readUInt32LE(0x3c)
  requireBytes(pe, 24)
  if (buffer.toString('ascii', pe, pe + 4) !== 'PE\0\0' || buffer.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Agent must be Windows x64')
  const sections = buffer.readUInt16LE(pe + 6)
  const optionalSize = buffer.readUInt16LE(pe + 20)
  const optional = pe + 24
  requireBytes(optional, optionalSize)
  if (optionalSize < 240 || buffer.readUInt16LE(optional) !== 0x20b || sections < 1 || sections > 96) throw new Error('Invalid PE32+ agent header')
  const directories = optional + 112
  if (buffer.readUInt32LE(directories + 14 * 8) || buffer.readUInt32LE(directories + 14 * 8 + 4)) throw new Error('Agent must not contain a CLR header')
  const flags = buffer.readUInt16LE(optional + 70)
  if ((flags & 0x140) !== 0x140) throw new Error('Agent must enable ASLR and DEP')
  const sectionBase = optional + optionalSize
  requireBytes(sectionBase, sections * 40)
  const fromRva = (rva) => {
    for (let index = 0; index < sections; index++) {
      const at = sectionBase + index * 40
      const virtualSize = buffer.readUInt32LE(at + 8)
      const virtualAddress = buffer.readUInt32LE(at + 12)
      const rawSize = buffer.readUInt32LE(at + 16)
      const rawAddress = buffer.readUInt32LE(at + 20)
      if (rva >= virtualAddress && rva - virtualAddress < Math.max(virtualSize, rawSize)) {
        const delta = rva - virtualAddress
        if (delta >= rawSize) throw new Error('Agent import points outside raw section data')
        requireBytes(rawAddress + delta, 1)
        return rawAddress + delta
      }
    }
    throw new Error('Agent import RVA does not resolve to a section')
  }
  const imports = []
  const importRva = buffer.readUInt32LE(directories + 8)
  if (!importRva) throw new Error('Agent has no Windows API imports')
  let descriptor = fromRva(importRva)
  for (let index = 0; index < 256; index++, descriptor += 20) {
    requireBytes(descriptor, 20)
    const nameRva = buffer.readUInt32LE(descriptor + 12)
    if (!nameRva) return { imports, machine: 'x64', native: true }
    const nameOffset = fromRva(nameRva)
    const end = buffer.indexOf(0, nameOffset)
    if (end < nameOffset || end - nameOffset > 260) throw new Error('Invalid agent import name')
    const name = buffer.toString('ascii', nameOffset, end).toLowerCase()
    // Only inbox Windows DLLs; no .NET or redistributable C++ runtime DLLs.
    // bcrypt.dll is the built-in CNG crypto API (Windows Vista and later) used
    // for hashing deploy payloads on the checkout.
    if (!/^(kernel32|kernelbase|advapi32|ole32|shell32|user32|msvcrt|ntdll|rpcrt4|sechost|bcrypt)\.dll$/.test(name) && !/^api-ms-win-(core|security|service|eventing)-[a-z0-9-]+\.dll$/.test(name)) {
      throw new Error(`Agent depends on an unexpected external DLL: ${name}`)
    }
    imports.push(name)
  }
  throw new Error('Agent import table is not terminated')
}
function verifyNativeAgent(file) {
  const size = fs.statSync(file).size
  if (size <= 0 || size > MAX_AGENT_BYTES) throw new Error(`Agent exceeds the ${MAX_AGENT_BYTES} byte native size budget (${size} bytes)`)
  const bytes = fs.readFileSync(file)
  return { ...inspectPe(bytes), size, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
}
if (require.main === module) console.log(JSON.stringify(verifyNativeAgent(process.argv[2]), null, 2))
module.exports = { verifyNativeAgent, inspectPe, MAX_AGENT_BYTES }
