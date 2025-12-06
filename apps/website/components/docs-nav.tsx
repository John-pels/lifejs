"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      className={`block rounded px-2 py-1 text-sm ${
        isActive ? "bg-neutral-200 font-medium" : "hover:bg-neutral-100"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block px-2 py-1 font-medium text-neutral-500 text-xs">{title}</span>
      <div className="ml-2 flex flex-col">{children}</div>
    </div>
  );
}

export function DocsNav() {
  return (
    <nav className="flex flex-col gap-3">
      <Section title="Welcome">
        <NavLink href="/docs/welcome/introduction">Introduction</NavLink>
        <NavLink href="/docs/welcome/installation">Installation</NavLink>
        <NavLink href="/docs/welcome/project-structure">Project Structure</NavLink>
        <NavLink href="/docs/welcome/ai-ide">AI IDE / MCP</NavLink>
      </Section>

      <Section title="Concepts">
        <NavLink href="/docs/concepts/agents">Agents</NavLink>
        <NavLink href="/docs/concepts/memory">Memories</NavLink>
        <NavLink href="/docs/concepts/actions">Actions</NavLink>
        <NavLink href="/docs/concepts/stores">Stores</NavLink>
        <NavLink href="/docs/concepts/percepts">Percepts</NavLink>
        <NavLink href="/docs/concepts/effects">Effects</NavLink>
        <NavLink href="/docs/concepts/scope">Scope</NavLink>
        <NavLink href="/docs/concepts/plugins">Plugins</NavLink>
      </Section>

      <Section title="Frontend Usage">
        <NavLink href="/docs/frontend-usage/react">React</NavLink>
        <NavLink href="/docs/frontend-usage/nextjs">Next.js</NavLink>
        <NavLink href="/docs/frontend-usage/vanilla">Vanilla JS</NavLink>
        <NavLink href="/docs/frontend-usage/other">Other</NavLink>
      </Section>

      <Section title="Configuration">
        <NavLink href="/docs/configuration/global-vs-local">Global vs Local</NavLink>
        <NavLink href="/docs/configuration/models">Models</NavLink>
        <NavLink href="/docs/configuration/transport">Transport</NavLink>
        <NavLink href="/docs/configuration/storage">Storage</NavLink>
      </Section>

      <Section title="Deployment">
        <NavLink href="/docs/deployment">Overview</NavLink>
      </Section>
    </nav>
  );
}

export function ReferencesNav() {
  return (
    <nav className="flex flex-col gap-3">
      <Section title="References">
        <NavLink href="/docs/references">Overview</NavLink>
        <NavLink href="/docs/references/cli">CLI</NavLink>
        <NavLink href="/docs/references/life-react">life/react</NavLink>
        <NavLink href="/docs/references/life-client">life/client</NavLink>
        <NavLink href="/docs/references/life-define">life/define</NavLink>
      </Section>
    </nav>
  );
}
