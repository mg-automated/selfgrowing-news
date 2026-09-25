import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  sortFn: (a, b) => {
    if (!a.isFolder && !b.isFolder) {
      const dailyPattern = /^news\/daily\/\d{4}-\d{2}-\d{2}$/
      const bothAreDaily =
        dailyPattern.test(a.slug.toLowerCase()) && dailyPattern.test(b.slug.toLowerCase())

      if (bothAreDaily) {
        return b.displayName.localeCompare(a.displayName, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      }

      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }

    if (a.isFolder && b.isFolder) {
      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }

    return a.isFolder ? -1 : 1
  },
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
