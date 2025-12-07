import { defaultTheme, extendTheme } from "@inkjs/ui";
import figures from "figures";
import type { BoxProps, TextProps } from "ink";
import { theme } from "@/cli/utils/theme";

// Define a custom Ink UI theme for progress bar
export const customInkUITheme = extendTheme(defaultTheme, {
  components: {
    ProgressBar: {
      styles: {
        container: (): BoxProps => ({
          flexGrow: 1,
          minWidth: 0,
        }),
        completed: (): TextProps => ({
          color: theme.orange,
        }),
        remaining: (): TextProps => ({
          dimColor: true,
        }),
      },
      config: () => ({
        completedCharacter: figures.square,
        remainingCharacter: figures.squareLightShade,
      }),
    },
  },
});
