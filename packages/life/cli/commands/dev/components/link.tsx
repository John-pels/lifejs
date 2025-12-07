import InkLink from "ink-link";

const fallback = (text: string, url: string) => `${text} (${url})`;

export const Link = ({ children, url }: { children: React.ReactNode; url: string }) => (
  <InkLink fallback={fallback} url={url}>
    {children}
  </InkLink>
);
