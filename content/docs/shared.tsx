import type { ReactNode } from "react";
import { Callout } from "@/components/docs/callout";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { ExplorerContractLink, SourcifyAlsoLink, VerifiedTag } from "@/components/docs/verified-tag";
import {
  DEPLOYMENT_ENTRIES,
  type DeploymentEntry,
  type DeploymentId,
  entryById,
} from "@/lib/docs/contracts-reference";

export function ProductionStatus({ children }: { children?: ReactNode }) {
  return (
    <Callout variant="warning" title="Current production status">
      {children ?? (
        <>
          Aurove contracts and the dApp are deployed on Mezo. Deposits that create a managed Mezo
          Earn position currently revert because both managers report <code>mTokenId = 0</code>.
          Concentrated-liquidity pool gauges have not been created, and avBTCm / avMEZOm are not
          whitelisted on the pool Voter. See{" "}
          <DocRouteLink href="/docs/protocol/security">Security and limitations</DocRouteLink>.
        </>
      )}
    </Callout>
  );
}

export function KindLabel({ kind }: { kind: DeploymentEntry["kind"] }) {
  const labels: Record<DeploymentEntry["kind"], string> = {
    proxy: "Proxy",
    implementation: "Implementation",
    beacon: "Beacon",
    "beacon-proxy": "Beacon proxy",
    token: "Token",
    pool: "Pool",
    gauge: "Gauge",
    factory: "Factory",
    router: "Router",
    adapter: "Adapter",
    eoa: "EOA",
  };
  return <>{labels[kind]}</>;
}

export function AddressRow({ entry }: { entry: DeploymentEntry }) {
  return (
    <tr>
      <td>
        <strong>{entry.name}</strong>
      </td>
      <td>
        <ExplorerContractLink address={entry.address} />
      </td>
      <td>{entry.role}</td>
      <td>
        <KindLabel kind={entry.kind} />
      </td>
      <td>
        {entry.verification === "none" ? (
          <span className="text-white/45">Not independently verified</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <VerifiedTag entry={entry} />
            <SourcifyAlsoLink entry={entry} />
          </div>
        )}
      </td>
    </tr>
  );
}

export function AddressTable({
  ids,
  entries,
}: {
  ids?: readonly DeploymentId[] | readonly string[];
  entries?: readonly DeploymentEntry[];
}) {
  const rows = entries ?? (ids ?? []).map((id) => entryById(id));
  return (
    <div className="my-4 overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Role</th>
            <th>Type</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <AddressRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FullDeploymentTables() {
  const groups: Array<{ title: string; filter: (entry: DeploymentEntry) => boolean }> = [
    { title: "Core Aurove", filter: (entry) => entry.package === "core" && entry.kind !== "eoa" },
    { title: "ID20 and zap router", filter: (entry) => entry.package === "id20" },
    { title: "Concentrated liquidity", filter: (entry) => entry.package === "cl" },
    { title: "External Mezo tokens and voters", filter: (entry) => entry.package === "mezo" },
    { title: "Privileged roles", filter: (entry) => entry.kind === "eoa" },
  ];

  return (
    <>
      {groups.map((group) => {
        const entries = DEPLOYMENT_ENTRIES.filter(group.filter);
        if (entries.length === 0) return null;
        return (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <AddressTable entries={entries} />
          </section>
        );
      })}
    </>
  );
}
