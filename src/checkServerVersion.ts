import { WorkspaceConfiguration } from "./interfaces/WorkspaceConfiguration";
import { ConfigurationTarget } from "./interfaces/ConfigurationTarget";
import http from "https";
import { parse } from "node-html-parser";

interface OnOutdatedParams {
  message: string;
  openSettingsChoice: string;
  upgradeChoice: string;
  dismissChoice: string;
  upgrade: () => void;
}

interface UpdateConfigParams {
  configSection: string;
  latestServerVersion: string;
  configurationTarget: ConfigurationTarget;
}

const configSection = "serverVersion";

interface CheckServerVersionParams {
  config: WorkspaceConfiguration;
  updateConfig: (params: UpdateConfigParams) => void;
  onOutdated: (params: OnOutdatedParams) => void;
}

export async function checkServerVersion({
  config,
  updateConfig,
  onOutdated,
}: CheckServerVersionParams) {
  const { serverVersion, latestServerVersion, configurationTarget } =
    serverVersionInfo(config);

  const latestParsed = parseMetalsVersion(latestServerVersion);
  const curentParsed = parseMetalsVersion(serverVersion);

  if (latestParsed && curentParsed) {
    const isOutdated = curentParsed.lt(latestParsed);

    const lookupNewest = (() => {
      if (curentParsed.date) {
        const date = new Date();
        const today =
          `${date.getUTCFullYear}` +
          `${("0" + (date.getUTCMonth() + 1)).slice(-2)}` +
          `${("0" + (date.getUTCDay() + 1)).slice(-2)}`;
        // do not upgrade several times per day
        return curentParsed.date != today;
      } else {
        return true;
      }
    })();

    const autoLatest = config.get<boolean>("autoLatestSnapshot");

    const askUpgradeOn = (async () => {
      if (autoLatest && lookupNewest) {
        const snapshots = await loadSnapshotVersions();
        const greater = snapshots.filter((v) => curentParsed.lt(v));
        const sorted = greater.sort((a, b) => a.compareTo(b));
        if (sorted.length > 0) {
          return sorted[sorted.length - 1];
        } else if (isOutdated) {
          return latestParsed;
        } else {
          return undefined;
        }
      } else if (isOutdated) {
        return latestParsed;
      } else {
        return undefined;
      }
    })();

    const nextVersion = await askUpgradeOn;
    if (nextVersion) {
      const message = nextVersion.isSnapshot()
        ? `New snapshot version ${nextVersion.value} is available`
        : `You are running an out-of-date version of Metals. The latest version is ${nextVersion.value}, but you have configured a custom server version ${serverVersion}`;
      const upgradeChoice = `Upgrade to ${nextVersion.value} now`;
      const openSettingsChoice = "Open settings";
      const dismissChoice = "Not now";
      const upgrade = () =>
        updateConfig({
          configSection,
          latestServerVersion,
          configurationTarget,
        });

      onOutdated({
        message,
        upgradeChoice,
        openSettingsChoice,
        dismissChoice,
        upgrade,
      });
    }
  }
}

function serverVersionInfo(config: WorkspaceConfiguration): {
  serverVersion: string;
  latestServerVersion: string;
  configurationTarget: ConfigurationTarget;
} {
  const computedVersion = config.get<string>(configSection)!;
  const { defaultValue, globalValue, workspaceValue } =
    config.inspect<string>(configSection)!;
  const configurationTarget = (() => {
    if (globalValue && globalValue !== defaultValue) {
      return ConfigurationTarget.Global;
    }
    if (workspaceValue && workspaceValue !== defaultValue) {
      return ConfigurationTarget.Workspace;
    }
    return ConfigurationTarget.Workspace;
  })();
  return {
    serverVersion: computedVersion,
    latestServerVersion: defaultValue!,
    configurationTarget,
  };
}

export function loadSnapshotVersions(): Promise<MetalsVersion[]> {
  const url =
    "https://oss.sonatype.org/content/repositories/snapshots/org/scalameta/metals_2.12/";
  const ps = new Promise<string>((resolve, reject) => {
    http.get(url, (resp) => {
      let body = "";
      resp.on("data", (chunk) => (body += chunk));
      resp.on("end", () => resolve(body));
      resp.on("error", (e) => reject(e));
    });
  });

  return ps.then((text) => {
    const root = parse(text);
    const versions = root.getElementsByTagName("tr").flatMap((e) => {
      const elem = e.getElementsByTagName("td")[0];
      if (elem) {
        const text = elem.text;
        if (text.endsWith("/")) {
          const parsed = parseMetalsVersion(text);
          return parsed ? [parsed] : [];
        } else {
          return [];
        }
      } else {
        return [];
      }
    });

    return versions;
  });
}

export class MetalsVersion {
  value: string;

  major: number;
  minor: number;
  patch: number;

  commitNum?: number;
  date?: string;

  constructor(
    value: string,
    major: number,
    minor: number,
    patch: number,
    commitNum?: number,
    date?: string
  ) {
    this.value = value;
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.commitNum = commitNum;
    this.date = date;
  }

  compareTo(other: MetalsVersion): number {
    function asList(v: MetalsVersion): number[] {
      return [v.major, v.minor, v.patch, v.commitNum ? v.commitNum : 0];
    }
    const one = asList(this);
    const two = asList(other);

    var out = 0;
    var idx = 0;
    while (out == 0 && idx < one.length) {
      const diff = one[idx] - two[idx];
      if (diff != 0) {
        out = diff;
      }
      idx = idx + 1;
    }
    return out;
  }

  isSnapshot(): boolean {
    return this.commitNum ? true : false;
  }

  lt(other: MetalsVersion): boolean {
    return this.compareTo(other) < 0;
  }

  gt(other: MetalsVersion): boolean {
    return !this.lt(other);
  }
}

export function parseMetalsVersion(value: string): MetalsVersion | undefined {
  const regex =
    /(\d+)\.(\d+)\.(\d+)((\+(\d+))-[0-9a-z]{8}(-(\d{8}))?-SNAPSHOT)?/;
  const matcher = value.match(regex);
  if (matcher) {
    const major = matcher[1];
    const minor = matcher[2];
    const patch = matcher[3];
    const commitNum = matcher[6];

    const date = matcher[8];

    const version = new MetalsVersion(
      value,
      parseInt(major),
      parseInt(minor),
      parseInt(patch),
      commitNum ? parseInt(commitNum) : undefined,
      date
    );
    return version;
  } else {
    return undefined;
  }
}
