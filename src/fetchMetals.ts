import * as semver from "semver";
import path from "path";
import fs from "fs";
import { ChildProcessPromise, spawn } from "promisify-child-process";
import { JavaConfig } from "./getJavaConfig";
import { OutputChannel } from "./interfaces/OutputChannel";

interface FetchMetalsOptions {
  serverVersion: string;
  serverProperties: string[];
  javaConfig: JavaConfig;
}

export function fetchMetals(
  {
    serverVersion,
    serverProperties,
    javaConfig: { javaPath, javaOptions, extraEnv, coursierPath },
  }: FetchMetalsOptions,
  output: OutputChannel
): ChildProcessPromise {
  const fetchProperties = serverProperties.filter(
    (p) => !p.startsWith("-agentlib")
  );
  const serverDependency = calcServerDependency(serverVersion);

  const coursierArgs = [
    "fetch",
    "-p",
    "--ttl",
    // Use infinite ttl to avoid redunant "Checking..." logs when using SNAPSHOT
    // versions. Metals SNAPSHOT releases are effectively immutable since we
    // never publish the same version twice.
    "Inf",
    serverDependency,
    "-r",
    "bintray:scalacenter/releases",
    "-r",
    "sonatype:public",
    "-r",
    "sonatype:snapshots",
    "-p",
  ];

  let possibleCoursier = process.env["PATH"]
    ?.split(path.delimiter)
    .flatMap((p) => {
      if (fs.statSync(p).isDirectory()) {
        return fs.readdirSync(p).map((sub) => path.resolve(p, sub));
      } else return [p];
    })
    .find(
      (p) => p.endsWith(path.sep + "cs") || p.endsWith(path.sep + "coursier")
    );

  function spawnDefault(): ChildProcessPromise {
    return spawn(
      javaPath,
      [
        ...javaOptions,
        ...fetchProperties,
        "-Dfile.encoding=UTF-8",
        "-jar",
        coursierPath,
      ].concat(coursierArgs),
      {
        env: {
          COURSIER_NO_TERM: "true",
          ...extraEnv,
          ...process.env,
        },
      }
    );
  }
  if (possibleCoursier) {
    let coursier: string = possibleCoursier;
    console.debug(`Using coursier located at ${coursier}`);
    output.appendLine(`Using coursier located at ${coursier}`);
    spawn(coursier, ["version"])
      .then((_out) => spawn(coursier, coursierArgs))
      .catch((err: Error) => {
        output.appendLine(err.message);
        console.debug(err);
        return spawnDefault();
      });
  }
  return spawnDefault();
}

export function calcServerDependency(serverVersion: string): string {
  if (serverVersion.includes(":")) {
    return serverVersion;
  } else {
    const use213 =
      semver.gt(serverVersion, "0.11.2") ||
      (serverVersion.startsWith("0.11.2") &&
        serverVersion.endsWith("SNAPSHOT"));
    const binaryVersion = use213 ? "2.13" : "2.12";
    return `org.scalameta:metals_${binaryVersion}:${serverVersion}`;
  }
}
