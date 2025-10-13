import { Box, type DOMElement, useInput } from "ink";
import { type ComponentPropsWithoutRef, type ComponentType, forwardRef } from "react";
import { useScreenSize } from "../hooks/use-screen-size";

export type BoxProps = ComponentPropsWithoutRef<typeof Box>;

export const FullScreenBox = forwardRef<DOMElement, BoxProps>((props, ref) => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: reason
  useInput(() => {}); // prevent input from rendering and shifting the layout
  const { height, width } = useScreenSize();
  return <Box height={height} ref={ref} width={width} {...props} />;
}) as ComponentType<BoxProps>;
