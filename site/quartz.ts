import {
  loadQuartzConfig,
  loadQuartzLayout,
} from "./quartz/plugins/loader/config-loader";
import { componentRegistry } from "./quartz/components/registry";
import { FileTrieNode } from "./quartz/util/fileTrie";

function groupDailyNotes(node: FileTrieNode<any>) {
  if (node.slug.toLowerCase() !== "news/daily/index") return;

  const dailyFilePattern = /^news\/daily\/(\d{4})-(\d{2})-(\d{2})$/;
  const monthNames = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const TrieNode = node.constructor as new (
    segments: string[],
  ) => FileTrieNode<any>;
  const dailyFiles = node.children.filter(
    (child) =>
      !child.isFolder && dailyFilePattern.test(child.slug.toLowerCase()),
  );
  if (dailyFiles.length === 0) return;

  const untouchedChildren = node.children.filter(
    (child) => !dailyFiles.includes(child),
  );
  const years = new Map<string, FileTrieNode<any>>();
  const months = new Map<string, FileTrieNode<any>>();

  for (const dailyFile of dailyFiles) {
    const match = dailyFile.slug.toLowerCase().match(dailyFilePattern);
    if (!match) continue;

    const [, year, month] = match;
    let yearNode = years.get(year);
    if (!yearNode) {
      yearNode = new TrieNode(["news", "daily", year]);
      yearNode.isFolder = true;
      years.set(year, yearNode);
    }

    const monthKey = `${year}-${month}`;
    let monthNode = months.get(monthKey);
    if (!monthNode) {
      monthNode = new TrieNode(["news", "daily", year, month]);
      monthNode.isFolder = true;
      yearNode.children.push(monthNode);
      months.set(monthKey, monthNode);
    }

    monthNode.children.push(dailyFile);
  }

  for (const [year, yearNode] of years) {
    const count = yearNode.children.reduce(
      (total, monthNode) => total + monthNode.children.length,
      0,
    );
    yearNode.displayName = `${year} (${count})`;
  }

  for (const [key, monthNode] of months) {
    const month = Number(key.slice(-2));
    const monthName = monthNames.format(new Date(Date.UTC(2000, month - 1, 1)));
    monthNode.displayName = `${monthName} (${monthNode.children.length})`;
  }

  node.children = [...untouchedChildren, ...years.values()];
}

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  mapFn: groupDailyNotes,
  sortFn: (a, b) => {
    if (!a.isFolder && !b.isFolder) {
      const aIsTrackRecord = a.slug.toLowerCase() === "outlook-track-record";
      const bIsTrackRecord = b.slug.toLowerCase() === "outlook-track-record";
      if (aIsTrackRecord !== bIsTrackRecord) {
        return aIsTrackRecord ? -1 : 1;
      }

      const dailyPattern = /^news\/daily\/\d{4}-\d{2}-\d{2}$/;
      const bothAreDaily =
        dailyPattern.test(a.slug.toLowerCase()) &&
        dailyPattern.test(b.slug.toLowerCase());

      if (bothAreDaily) {
        return b.displayName.localeCompare(a.displayName, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    if (a.isFolder && b.isFolder) {
      const aDailyArchiveFolder =
        /^news\/daily\/(\d{4})(?:\/(\d{2}))?\/index$/i.exec(a.slug);
      const bDailyArchiveFolder =
        /^news\/daily\/(\d{4})(?:\/(\d{2}))?\/index$/i.exec(b.slug);

      if (aDailyArchiveFolder && bDailyArchiveFolder) {
        return b.slug.localeCompare(a.slug, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    return a.isFolder ? -1 : 1;
  },
});

const config = await loadQuartzConfig();
export default config;
export const layout = await loadQuartzLayout();
