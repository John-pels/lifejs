import chalk from "chalk";

export const theme = {
  orange: "#E77823",
  gray: {
    light: "#bbbbbb",
    medium: "#888888",
    dark: "#444444",
  },
} as const;

export const themeChalk = {
  orange: chalk.hex(theme.orange),
  gray: {
    light: chalk.hex(theme.gray.light),
    medium: chalk.hex(theme.gray.medium),
    dark: chalk.hex(theme.gray.dark),
  },
};
