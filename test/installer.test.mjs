import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const installerSource = await readFile(
  new URL("../build/installer.nsh", import.meta.url),
  "utf8",
)
const electronMain = await readFile(
  new URL("../electron/main.mjs", import.meta.url),
  "utf8",
)
const packageInfo = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
)

test("설치 완료 자동 실행은 시작 메뉴 바로가기 대신 설치 EXE를 사용한다", () => {
  assert.equal(packageInfo.build.nsis.runAfterFinish, true)
  assert.match(
    installerSource,
    /!macro customInstall\s+StrCpy \$launchLink "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}"\s+!macroend/,
  )
})

test("업데이트 중에는 트레이 시작 설정을 보존하고 누락된 작업을 복구한다", () => {
  assert.match(
    installerSource,
    /!macro customInit[\s\S]*schtasks\.exe" \/Query \/TN "Mabinogi Rem Booster Startup"[\s\S]*WriteRegDWORD HKCU "Software\\Nogirem" "StartupTrayEnabled" 1/,
  )
  assert.match(
    installerSource,
    /!macro customUnInstall[\s\S]*\$\{IfNot\} \$\{isUpdated\}[\s\S]*schtasks\.exe" \/Delete[\s\S]*DeleteRegValue[\s\S]*\$\{EndIf\}/,
  )
  assert.match(
    electronMain,
    /async function getStartupTraySetting\(\)[\s\S]*state\.preferred \|\| valid[\s\S]*applyStartupTraySetting\(true\)/,
  )
  assert.match(
    electronMain,
    /async function applyStartupTraySetting\(enabled\)[\s\S]*StartupTrayEnabled[\s\S]*Register-ScheduledTask/,
  )
})
