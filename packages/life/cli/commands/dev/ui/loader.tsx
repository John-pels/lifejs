import { ProgressBar } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";

interface DevLoaderProps {
  loadingProgress: number;
  loadingStatus: string | null;
  loadingError: string | null;
}

export const DevLoader: FC<DevLoaderProps> = ({ loadingProgress, loadingStatus, loadingError }) => {
  return (
    <Box
      alignItems="center"
      borderColor="gray"
      borderStyle="round"
      flexDirection="column"
      gap={1}
      height="100%"
      justifyContent="center"
      width="100%"
    >
      {loadingError && (
        <Box alignItems="center" flexDirection="column" justifyContent="center" padding={4}>
          <Box borderColor="red" borderStyle="round" justifyContent="center" paddingX={1}>
            <Text color={"red"}>Error starting the Life.js development server</Text>
          </Box>
          <Text>{"\n"}</Text>
          <Text color={"red"}>{loadingError}</Text>
        </Box>
      )}
      {!loadingError && (
        <>
          <Text color={theme.orange}>Life.js</Text>
          <Box width={40}>
            <ProgressBar value={loadingProgress} />
          </Box>
          <Text color={theme.gray.medium}>{loadingStatus}</Text>
        </>
      )}
    </Box>
  );
};
