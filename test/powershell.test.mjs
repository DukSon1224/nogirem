import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { runPowerShellScript } from "../src/powershell.mjs"

const [powerShellSource, mainSource, networkSource, nicSource] = await Promise.all([
  readFile(new URL("../src/powershell.mjs", import.meta.url), "utf8"),
  readFile(new URL("../electron/main.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/network.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/nic.mjs", import.meta.url), "utf8"),
])

test("런타임 PowerShell 본문은 명령줄 대신 표준입력으로 전달한다", () => {
  assert.match(
    powerShellSource,
    /\["-NoProfile", "-NonInteractive", "-Command", "-"\]/,
  )
  assert.match(powerShellSource, /child\.stdin\.end\(String\(script\), "utf8"\)/)
  assert.doesNotMatch(mainSource, /powershell\.exe|-EncodedCommand/)
  assert.doesNotMatch(networkSource, /powershell\.exe/)
  assert.doesNotMatch(nicSource, /powershell\.exe/)
})

test("메모리와 affinity helper는 PowerShell 없이 직접 분리 실행한다", () => {
  const helperStart = mainSource.indexOf("async function launchDetachedElectronHelper(")
  const helperEnd = mainSource.indexOf("async function stopAffinityHelper()", helperStart)
  const helperSource = mainSource.slice(helperStart, helperEnd)

  assert.match(helperSource, /spawn\(process\.execPath, helperArguments,/)
  assert.match(helperSource, /detached: true/)
  assert.match(helperSource, /child\.unref\(\)/)
  assert.match(helperSource, /launchMemoryHelper[\s\S]*launchDetachedElectronHelper\(helperArguments\)/)
  assert.match(helperSource, /launchAffinityHelper[\s\S]*launchDetachedElectronHelper\(helperArguments\)/)
})

test("PowerShell 표준입력 실행 결과를 UTF-8로 반환한다", {
  skip: process.platform !== "win32",
}, async () => {
  const { stdout } = await runPowerShellScript(
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Write-Output 123",
  )
  assert.equal(stdout.trim(), "123")
})

test("PowerShell 표준입력 실행이 제한 시간을 넘으면 종료한다", {
  skip: process.platform !== "win32",
}, async () => {
  await assert.rejects(
    runPowerShellScript("Start-Sleep -Seconds 5", { timeout: 100 }),
    error => error?.code === "ETIMEDOUT" && error?.killed === true,
  )
})
