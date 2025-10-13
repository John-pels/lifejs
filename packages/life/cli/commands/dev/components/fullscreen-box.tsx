import { Box, useInput } from "ink";
import type { ComponentProps, FC } from "react";
import { useScreenSize } from "../hooks/use-screen-size";

export type BoxProps = ComponentProps<typeof Box>;

export const FullScreenBox: FC<BoxProps> = (props) => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: reason
  useInput(() => {}); // prevent input from rendering and shifting the layout
  const { height, width } = useScreenSize();
  return <Box height={height} ref={props.ref} width={width} {...props} />;
};
