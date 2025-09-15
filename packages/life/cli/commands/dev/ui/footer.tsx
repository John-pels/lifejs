import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";

interface DevFooterProps {
  copyMode: boolean;
}

export const DevFooter: FC<DevFooterProps> = ({ copyMode }) => {
  return (
    <>
      {copyMode && (
        <Box
          alignItems="center"
          borderColor={theme.orange}
          borderStyle="doubleSingle"
          justifyContent="center"
          marginTop={5}
          paddingX={2}
          paddingY={1}
          width="100%"
        >
          <Text>
            You entered <Text color={theme.orange}>copy mode</Text>. UI controls are hidden so you
            can freely copy your logs. Press <Text color={theme.orange}>c</Text> again to exit copy
            mode.
          </Text>
        </Box>
      )}
      <Box
        alignItems="center"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderStyle="round"
        borderTop={copyMode}
        borderTopColor="gray"
        flexShrink={0}
        justifyContent="space-between"
        paddingX={2}
        width="100%"
      >
        <Text color="gray">
          <Text bold color={theme.orange}>
            ↑/↓
          </Text>
          : Sidebar options
        </Text>
        <Text color="gray">
          <Text bold color={theme.orange}>
            c
          </Text>
          : {copyMode ? "Exit copy Mode" : "Copy mode"}
        </Text>
        <Text color="gray">
          <Text bold color={theme.orange}>
            CTRL-C/q
          </Text>
          : Quit
        </Text>
      </Box>
    </>
  );
};
