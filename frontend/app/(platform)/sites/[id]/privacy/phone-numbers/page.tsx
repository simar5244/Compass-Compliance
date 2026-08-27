"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";

import { getPrivacyPhoneNumbers, type ExposedPhone } from "@/lib/auth";
import { ExposedValuesScreen } from "@/components/platform/site/privacy/ExposedValuesScreen";

const INTRO =
  "Check that any phone numbers which are published on this website are not personal data, and if " +
  "they are ensure that you have appropriate consent and protections for this data. Location and " +
  "country come from the number's own dialling code, so a code covering a single city names that " +
  "city, a wider code names the state, and a toll-free range names neither.";

export default function PrivacyPhoneNumbersPage() {
  const params = useParams<{ id: string }>();
  const load = useCallback(
    (siteId: string) => getPrivacyPhoneNumbers(siteId).then((r) => ({ scan_id: r.scan_id, rows: r.numbers })),
    [],
  );

  return (
    <div className="light-theme min-h-full bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="mt-1 grid h-12 w-12 flex-none place-items-center rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] text-[#525252]"
          >
            <Phone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Privacy</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Phone numbers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>
          </div>
        </div>
      </header>

      <ExposedValuesScreen<ExposedPhone>
        checkId="phone_numbers_exposed"
        title="Review publicly visible phone numbers"
        intro={INTRO}
        valueTabLabel="Phone numbers"
        valueHeader="Phone number"
        approveLabel="Approve phone"
        href={`/sites/${params.id}/privacy/phone-numbers`}
        load={load}
        linkFor={(row) => `tel:${row.value.replace(/[^+\d]/g, "")}`}
        displayValue={(row) => row.formatted || row.value}
        columns={[
          { header: "Location", width: "w-[190px]", render: (row) => row.location || "" },
          { header: "Country", width: "w-[110px]", render: (row) => row.country || "" },
        ]}
      />
    </div>
  );
}
