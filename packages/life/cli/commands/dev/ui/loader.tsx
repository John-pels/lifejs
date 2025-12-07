import { ProgressBar } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";

interface DevLoaderProps {
  loadingProgress: number;
  loadingStatus: string | null;
  loadingError?: string | null;
}

export const DevLoader: FC<DevLoaderProps> = ({ loadingProgress, loadingStatus }) => (
  <Box
    alignItems="center"
    borderColor="gray"
    borderStyle="round"
    flexDirection="column"
    height="100%"
    justifyContent="center"
    padding={3}
    width="100%"
  >
    <Box alignItems="center" flexDirection="column" gap={1} justifyContent="center">
      <Text color={theme.orange}>Life.js</Text>
      <Box width={40}>
        <ProgressBar value={loadingProgress} />
      </Box>
      <Text color={theme.gray.medium}>{loadingStatus}</Text>
    </Box>
  </Box>
);
