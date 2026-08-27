"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";

import { getPrivacyEmails, type ExposedEmail } from "@/lib/auth";
import { ExposedValuesScreen } from "@/components/platform/site/privacy/ExposedValuesScreen";

const INTRO =
  "Review every email address published on this site. Personal mailboxes need a lawful basis and " +
  "appropriate protections; shared or generic inboxes usually do not. Addresses are grouped by the " +
  "host that receives them, so a mailbox on your own domain is easy to tell from mail that lands " +
  "somewhere else.";

export default function PrivacyEmailsPage() {
  const params = useParams<{ id: string }>();
  const load = useCallback(
    (siteId: string) => getPrivacyEmails(siteId).then((r) => ({ scan_id: r.scan_id, rows: r.emails })),
    [],
  );

  return (
    <ExposedValuesScreen<ExposedEmail>
      checkId="email_addresses_exposed"
      title="Public email addresses"
      intro={INTRO}
      valueTabLabel="Emails"
      valueHeader="Email"
      approveLabel="Approve email"
      href={`/sites/${params.id}/privacy/emails`}
      load={load}
      linkFor={(row) => `mailto:${row.value}`}
      displayValue={(row) => row.value}
      columns={[
        {
          header: "Hostname",
          width: "w-[240px]",
          render: (row) => (
            <span className="font-mono text-[13px] text-[#737373]">{row.hostname}</span>
          ),
        },
      ]}
    />
  );
}
