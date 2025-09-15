import { ProgressBar } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import type { DevOptions } from "../action";
import { Divider } from "../components/divider";

interface DevLoaderProps {
  options: DevOptions;
  loadingProgress: number;
  loadingStatus: string | null;
  loadingError: string | null;
}

export const DevLoader: FC<DevLoaderProps> = ({
  options,
  loadingProgress,
  loadingStatus,
  loadingError,
}) => {
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
      {!loadingError && (
        <>
          <Text color={theme.orange}>Life.js</Text>
          <Box width={40}>
            <ProgressBar value={loadingProgress ?? 0} />
          </Box>
          <Text color={theme.gray.medium}>{loadingStatus}</Text>
        </>
      )}
      {loadingError && (
        <Box alignItems="center" flexDirection="column" justifyContent="center" padding={3}>
          <Box
            alignItems="center"
            borderColor="red"
            borderStyle="round"
            justifyContent="center"
            paddingX={1}
          >
            <Text color={"red"}>Error starting the Life.js development server</Text>
          </Box>
          <Text>{"\n"}</Text>
          <Text color={"red"}>{loadingError}</Text>
          <Text>{"\n"}</Text>
          {!options.debug && (
            <>
              <Divider borderDimColor={true} color={"red"} width={40} />
              <Text color={"red"} dimColor={true}>
                Run with --debug to see logs.
              </Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
