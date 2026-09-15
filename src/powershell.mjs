import { spawn } from "node:child_process"

export function runPowerShellScript(
  script,
  {
    timeout = 30000,
    maxBuffer = 1024 * 1024,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$reader=[IO.StreamReader]::new([Console]::OpenStandardInput(),[Text.UTF8Encoding]::new($false),$false);& ([ScriptBlock]::Create($reader.ReadToEnd()))",
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    let failure = null

    const collect = (chunks, chunk, currentBytes) => {
      const nextBytes = currentBytes + chunk.length
      if (nextBytes > maxBuffer && !failure) {
        failure = new Error("PowerShell 출력이 허용 크기를 초과했습니다")
        failure.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
        child.kill()
      } else if (!failure) {
        chunks.push(chunk)
      }
      return nextBytes
    }

    child.stdout.on("data", chunk => {
      stdoutBytes = collect(stdoutChunks, chunk, stdoutBytes)
    })
    child.stderr.on("data", chunk => {
      stderrBytes = collect(stderrChunks, chunk, stderrBytes)
    })
    child.stdin.on("error", () => {})

    const timer = setTimeout(() => {
      if (settled || failure) return
      failure = new Error(`PowerShell 실행 제한 시간 ${timeout}ms를 초과했습니다`)
      failure.code = "ETIMEDOUT"
      failure.killed = true
      child.kill()
    }, timeout)
    timer.unref()

    child.once("error", error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stdout = Buffer.concat(stdoutChunks).toString("utf8")
      const stderr = Buffer.concat(stderrChunks).toString("utf8")
      if (failure) {
        failure.stdout = stdout
        failure.stderr = stderr
        reject(failure)
        return
      }
      if (code !== 0) {
        const error = new Error(`PowerShell이 종료 코드 ${code}를 반환했습니다`)
        error.code = code
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })

    child.stdin.end(String(script), "utf8")
  })
}
