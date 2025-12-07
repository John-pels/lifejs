import { useMouseAction } from "@zenobius/ink-mouse";
import { Box, type DOMElement, measureElement, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import wrapAnsi from "wrap-ansi";

interface ScrollAreaProps extends React.ComponentProps<typeof Box> {
  lines: string[];
  showScrollbar?: boolean;
}

export const ScrollTextBox = ({ lines, showScrollbar = true, ...props }: ScrollAreaProps) => {
  // Prevents the scroll characters to be rendered
  useInput(() => void 0);

  // Track inner and container boxes
  const containerRef = useRef<DOMElement | null>(null);

  // Track container sizes
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = measureElement(containerRef.current);
    setContainerHeight(measure.height);
    setContainerWidth(measure.width);
  }, []);

  // Compute non-breaking lines
  const wrappedLinesCacheRef = useRef({ lines: [] as string[], width: 0, wrapped: [] as string[] });
  const maxWidth = containerWidth - 2;
  const wrappedLines = useMemo(() => {
    const cache = wrappedLinesCacheRef.current;

    // If width changed, invalidate the cache
    if (cache.width !== maxWidth) {
      cache.lines = [];
      cache.width = maxWidth;
      cache.wrapped = [];
    }

    // Return cached wrapped lines if lines haven't changed
    const lastCachedIndex = cache.lines.length;
    if (lines.length === lastCachedIndex && lines.every((line, i) => line === cache.lines[i])) {
      return cache.wrapped;
    }

    // Only wrap new lines and append to cache
    const newLines = lines.slice(lastCachedIndex);
    const newWrapped: string[] = [];
    for (const line of newLines)
      newWrapped.push(...wrapAnsi(line, maxWidth, { hard: true, trim: false }).split("\n"));

    // Update cache
    cache.lines = [...lines];
    cache.wrapped = [...cache.wrapped, ...newWrapped];
    return cache.wrapped;
  }, [lines, maxWidth]);

  const [follow, setFollow] = useState(true);

  // Handle mouse scroll actions
  const event = useMouseAction();
  const contentHeight = wrappedLines.length;
  const maxScroll = contentHeight - containerHeight;
  const contentIsOverflowing = contentHeight > containerHeight;
  useEffect(() => {
    // Prevent scrolling if content doesn't overflow the container
    if (!contentIsOverflowing) return;

    // Else compute the new scroll position
    if (event === "scrollup") setScroll((prev) => Math.max(0, (follow ? maxScroll : prev) - 1));
    else if (event === "scrolldown")
      setScroll((prev) => Math.min(maxScroll, (follow ? maxScroll : prev) + 1));

    // Set scrollbar to active when scrolling
    if (event === "scrollup" || event === "scrolldown") setIsScrollbarActive(true);
  }, [contentIsOverflowing, event, follow, maxScroll]);

  // Set follow mode if the scroll position is at the bottom of the content
  const [scroll, setScroll] = useState<number>(0);
  useEffect(() => {
    if (scroll === contentHeight - containerHeight) setFollow(true);
    else setFollow(false);
  }, [contentHeight, scroll, containerHeight]);

  // Compute visible lines
  const visibleLines = useMemo(
    () => wrappedLines.slice(scroll, scroll + containerHeight),
    [wrappedLines, scroll, containerHeight],
  );

  // Track scrollbar activity for opacity effect
  const [isScrollbarActive, setIsScrollbarActive] = useState(true);

  // Set scrollbar to inactive after 1000ms of inactivity
  useEffect(() => {
    if (!isScrollbarActive) return;
    const inactivityTimeout = setTimeout(() => setIsScrollbarActive(false), 1000);
    return () => clearTimeout(inactivityTimeout);
  }, [isScrollbarActive]);

  // Adjust scroll position when dimensions change
  useEffect(() => {
    // If content doesn't overflow, reset scroll
    if (contentHeight <= containerHeight) return setScroll(0);
    // If in follow mode, stay at the bottom
    if (follow) setScroll(maxScroll);
    // If not in follow mode, ensure scroll doesn't exceed new boundaries
    else setScroll((prev) => Math.min(prev, maxScroll));
  }, [contentHeight, containerHeight, follow, maxScroll]);

  // Calculate scrollbar dimensions and position
  const scrollbarHeight = Math.max(
    3,
    Math.floor((containerHeight / (contentHeight || 1)) * containerHeight),
  );

  const scrollbarPosition =
    (scroll / (contentHeight - containerHeight || 1)) * (containerHeight - scrollbarHeight);

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
      <Text>{visibleLines.join("\n")}</Text>
      {showScrollbar && contentIsOverflowing && (
        <Box
          alignItems="flex-end"
          flexDirection="row"
          justifyContent="flex-end"
          position="absolute"
          width="100%"
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
