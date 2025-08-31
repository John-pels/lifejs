import { useMouseAction } from "@zenobius/ink-mouse";
import { Box, type DOMElement, measureElement, useInput } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useScreenSize } from "../hooks/use-screen-size.js";

interface ScrollAreaProps extends React.ComponentProps<typeof Box> {
  children: React.ReactNode;
  showScrollbar?: boolean;
}

export const ScrollBox = ({ children, showScrollbar = true, ...props }: ScrollAreaProps) => {
  // Prevents the scroll characters to be rendered
  // biome-ignore lint/suspicious/noEmptyBlockStatements: reason
  useInput(() => {});

  // Track inner and container boxes
  const innerRef = useRef<DOMElement | null>(null);
  const containerRef = useRef<DOMElement | null>(null);

  // Track scroll position and container heights
  const { height, width } = useScreenSize();
  const [innerHeight, setInnerHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    if (!innerRef.current) return;
    setInnerHeight(measureElement(innerRef.current).height);
  }, [children, height, width]);
  useEffect(() => {
    if (!containerRef.current) return;
    setContainerHeight(measureElement(containerRef.current).height);
  }, [children, height, width]);

  // Track scrollbar activity for opacity effect
  const [isScrollbarActive, setIsScrollbarActive] = useState(true);

  // Handle mouse scroll actions
  const [scroll, setScroll] = useState<number>(0);
  const event = useMouseAction();
  useEffect(() => {
    // Prevent scrolling if content doesn't overflow the container
    if (!(event && containerHeight) || innerHeight <= containerHeight) return;

    // Else compute the new scroll position
    const maxScroll = innerHeight - containerHeight;
    if (event === "scrollup") setScroll((prev) => Math.max(0, (follow ? maxScroll : prev) - 1));
    else if (event === "scrolldown")
      setScroll((prev) => Math.min(maxScroll, (follow ? maxScroll : prev) + 1));

    if (event === "scrollup") setFollow(false);

    // Set scrollbar to active when scrolling
    if (event === "scrollup" || event === "scrolldown") setIsScrollbarActive(true);
  }, [event]);

  // Set scrollbar to inactive after 2 seconds of inactivity
  useEffect(() => {
    if (!isScrollbarActive) return;

    const inactivityTimeout = setTimeout(() => {
      // After 2 seconds, set to inactive
      setIsScrollbarActive(false);
    }, 1000);

    return () => clearTimeout(inactivityTimeout);
  }, [isScrollbarActive]);

  // Set follow mode if the scroll position is at the bottom of the content
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (scroll === innerHeight - containerHeight) {
      setFollow(true);
      // setScroll(innerHeight - containerHeight);
    }
  }, [children, scroll, innerHeight, containerHeight]);

  // Adjust scroll position when dimensions change
  useEffect(() => {
    if (innerHeight <= containerHeight) {
      // If content doesn't overflow, reset scroll
      setScroll(0);
      return;
    }

    const maxScroll = innerHeight - containerHeight;
    if (follow) {
      // If in follow mode, stay at the bottom
      setScroll(maxScroll);
    } else {
      // If not in follow mode, ensure scroll doesn't exceed new boundaries
      setScroll((prev) => Math.min(prev, maxScroll));
    }
  }, [innerHeight, containerHeight, follow]);

  // Check if the content is overflowing the container
  const contentIsOverflowing = innerHeight > containerHeight;

  // Calculate scrollbar dimensions and position
  const scrollbarHeight =
    containerHeight > 0 && innerHeight > 0
      ? Math.max(3, Math.floor((containerHeight / innerHeight) * containerHeight))
      : 0;

  const scrollbarPosition =
    containerHeight > 0 && innerHeight > 0 && innerHeight > containerHeight
      ? Math.floor((scroll / (innerHeight - containerHeight)) * (containerHeight - scrollbarHeight))
      : 0;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      justifyContent={follow && contentIsOverflowing ? "flex-end" : "flex-start"}
      overflow="hidden"
      position="relative"
      ref={containerRef}
      {...props}
    >
      <Box
        flexDirection="column"
        flexShrink={0}
        marginTop={follow && contentIsOverflowing ? 0 : -Math.max(0, scroll)}
        ref={innerRef}
      >
        {children}
      </Box>

      {/* Debug */}
      {/* <Box position="absolute" top={0} right={0} flexDirection="row" justifyContent="flex-start">
        <Text backgroundColor="yellow">
          {`scroll:${scroll}-follow:${follow.toString()}-ov:${contentIsOverflowing.toString()}`}
        </Text>
      </Box> */}

      {showScrollbar && contentIsOverflowing && (
        <Box
          bottom={0}
          flexDirection="row"
          justifyContent="flex-end"
          position="absolute"
          right={1}
          top={0}
        >
          <Box
            borderColor={isScrollbarActive ? "#E75E23" : "gray"}
            borderDimColor={!isScrollbarActive}
            borderStyle="round"
            height={scrollbarHeight}
            marginTop={scrollbarPosition}
            width={1}
          />
        </Box>
      )}
    </Box>
  );
};
