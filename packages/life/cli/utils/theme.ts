import chalk from "chalk";

// To be used in Ink.js components' color properties
export const theme = {
  orange: "#E77823",
  gray: {
    light: "#bbbbbb",
    medium: "#888888",
    dark: "#444444",
  },
  level: {
    fatal: "red",
    error: "red",
    warn: "#FFA500",
    info: "cyan",
    debug: "gray",
  },
} as const;

// To be used in plain-text manipulation
export const themeChalk = {
  orange: chalk.hex(theme.orange),
  gray: {
    light: chalk.hex(theme.gray.light),
    medium: chalk.hex(theme.gray.medium),
    dark: chalk.hex(theme.gray.dark),
  },
  level: {
    fatal: chalk.bgRed,
    error: chalk.red,
    info: chalk.cyan,
    debug: chalk.gray,
    warn: chalk.hex(theme.level.warn),
  },
} as const;
