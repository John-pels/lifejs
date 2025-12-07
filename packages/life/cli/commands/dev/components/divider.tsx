import { Box, type BoxProps } from "ink";
import type React from "react";

/**
 * Props for the Divider component.
 */
export interface DividerProps extends BoxProps {
  /**
   * Color of the divider's border. Matches the type of `borderColor` in the Ink `Box` component.
   * Accepts standard Ink color names or hex codes.
   * @default "blackBright"
   */
  color?: BoxProps["borderColor"];
}

/**
 * A horizontal divider component styled as a single border line.
 *
 * @param props - Properties to customize the divider.
 * @returns A styled Ink `Box` component representing a divider.
 */
export const Divider: React.FC<DividerProps> = ({ color = "blackBright", ...props }) => (
  <Box
    borderBottom={true}
    borderColor={color}
    borderLeft={false}
    borderRight={false}
    borderStyle="single"
    borderTop={false}
    {...props}
  />
);
