import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const projectDir = process.cwd();

function run(command) {
  execSync(command, { cwd: projectDir, stdio: "inherit" });
}

function getPort3000Pid() {
  try {
    const output = execSync("lsof -nP -iTCP:3000 -sTCP:LISTEN -t", {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return output ? Number(output.split("\n")[0]) : null;
  } catch {
    return null;
  }
}

function getProcessCwd(pid) {
  try {
    const output = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return (
      output
        .split("\n")
        .find((line) => line.startsWith("n"))
        ?.slice(1) ?? null
    );
  } catch {
    return null;
  }
}

function getCommand(pid) {
  try {
    return execSync(`ps -o command= -p ${pid}`, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

run("docker compose up -d");

const existingPid = getPort3000Pid();

if (existingPid) {
  const existingCwd = getProcessCwd(existingPid);
  const command = getCommand(existingPid);

  if (
    existingCwd &&
    path.resolve(existingCwd) === projectDir &&
    command.includes("next-server")
  ) {
    process.kill(existingPid, "SIGTERM");
  } else {
    console.error(
      `Port 3000 is already in use by PID ${existingPid}. Stop that process and run npm run dev again.`,
    );
    process.exit(1);
  }
}

const result = spawnSync("npx", ["next", "dev", "--port", "3000"], {
  cwd: projectDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
