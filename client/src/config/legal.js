const cleanPublicText = (value, fallback, maxLength = 200) => {
    const normalized = String(value || '').trim();
    return (normalized || fallback).slice(0, maxLength);
};

const configuredPrivacyEmail = cleanPublicText(
    import.meta.env.VITE_PRIVACY_CONTACT_EMAIL,
    'sibuyan.alert@gmail.com',
    254,
).toLowerCase();

const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredPrivacyEmail);

export const LEGAL_CONFIG = Object.freeze({
    operatorName: cleanPublicText(
        import.meta.env.VITE_LEGAL_OPERATOR_NAME,
        'Sibuyan Alert System Administration',
    ),
    operatorAddress: cleanPublicText(
        import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS,
        'Sibuyan Island, Romblon, Philippines',
    ),
    privacyEmail: isValidEmail ? configuredPrivacyEmail : 'sibuyan.alert@gmail.com',
    effectiveDate: cleanPublicText(
        import.meta.env.VITE_LEGAL_EFFECTIVE_DATE,
        'August 8, 2026',
        80,
    ),
});

const { operatorName, operatorAddress, privacyEmail, effectiveDate } = LEGAL_CONFIG;

export const LEGAL_DOCUMENTS = Object.freeze({
    privacy: {
        title: 'Privacy Policy',
        effectiveDate,
        intro: `${operatorName} operates Sibuyan Alert, an incident reporting and emergency coordination system serving Cajidiocan, Magdiwang, and San Fernando. This policy explains how personal data is handled when you visit the public map, create an account, submit an incident, or use an authorized operational workspace.`,
        sections: [
            {
                title: '1. Who is responsible for your data',
                paragraphs: [
                    `${operatorName}, located at ${operatorAddress}, is responsible for the deployed system and the personal data under its control. Privacy questions and requests may be sent to ${privacyEmail}.`,
                ],
            },
            {
                title: '2. Personal data we process',
                items: [
                    'Account and profile data, including name, email address, municipality, barangay, address, role, agency, and notification preferences.',
                    'Reporter verification data, including identification documents, selfie images, verification status, review history, and administrator feedback.',
                    'Incident data, including category, description, severity, time, precise coordinates, address, evidence images, situation updates, casualties, and response or transfer history.',
                    'Authentication and security data, including password hashes, essential session and CSRF cookies, password-reset records, login timestamps, and basic request metadata used to protect the service.',
                    'Notification data, including in-app messages, email delivery choices, and browser push subscription details when push notifications are enabled.',
                ],
            },
            {
                title: '3. Why and how we use data',
                items: [
                    'Create and secure accounts, verify eligible reporters, and enforce role- and municipality-based access.',
                    'Receive, validate, map, review, transfer, respond to, and resolve incident reports.',
                    'Notify reporters, municipal administrators, and eligible response units about relevant incident activity.',
                    'Publish verified public-safety information without displaying reporter identities, private evidence, or internal coordination details.',
                    'Maintain auditability, investigate misuse, protect system security, produce operational statistics, and comply with applicable legal obligations.',
                ],
                paragraphs: [
                    'Processing is based on consent where required, delivery and administration of the requested service, legitimate safety and security purposes, applicable legal obligations, and the mandate of participating public authorities where applicable. Only data that is relevant and proportionate to these purposes should be processed.',
                ],
            },
            {
                title: '4. Visibility and disclosure',
                items: [
                    'Public visitors may see verified incident details needed for public awareness, such as general location, category, severity, time, and lifecycle status.',
                    'Authorized municipal administrators may access reports and verification information within their permitted jurisdiction and duties.',
                    'Eligible responders may access operational details and private evidence only when authorized by municipality, assignment, and incident status.',
                    'Service providers supporting hosting, database storage, email, browser push, mapping, geocoding, or security may process limited data only as needed to deliver their services.',
                    'Data may be disclosed when required by law, a valid government request, or an urgent need to protect life, safety, rights, or system integrity.',
                ],
            },
            {
                title: '5. Retention and deletion',
                paragraphs: [
                    'In-app notifications automatically expire after 30 days. Account, verification, incident, evidence, and audit records are retained only while reasonably necessary for emergency coordination, accountability, dispute handling, security, and applicable legal or records-management requirements. Deletion requests are evaluated against these obligations, and data is securely deleted or de-identified when it is no longer required.',
                ],
            },
            {
                title: '6. Security safeguards',
                paragraphs: [
                    'Reasonable organizational and technical safeguards are used, including password hashing, HttpOnly session authentication, CSRF protection, restricted evidence delivery, server-side authorization, upload validation, rate limiting, and municipality-scoped access. No internet service can guarantee absolute security; suspected unauthorized access should be reported immediately.',
                ],
            },
            {
                title: '7. Your data-subject rights',
                paragraphs: [
                    'Subject to the Data Privacy Act of 2012 and its implementing rules, you may request to be informed, access or correct your data, object to certain processing, request erasure or blocking where legally available, obtain data portability where applicable, claim damages, and lodge a complaint with the National Privacy Commission. Identity verification may be required before a request is completed.',
                ],
                links: [
                    {
                        label: 'National Privacy Commission: Data Subject Rights',
                        href: 'https://privacy.gov.ph/data-subject-rights/',
                    },
                    {
                        label: 'Republic Act No. 10173 — Data Privacy Act of 2012',
                        href: 'https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html',
                    },
                ],
            },
            {
                title: '8. Cookies, location, and notifications',
                paragraphs: [
                    'Sibuyan Alert uses essential cookies for sign-in and request security, not advertising cookies. Device location is requested only when a user chooses location-assisted reporting; a map pin or address search may be used instead. Browser push notifications are optional and may be disabled in profile or browser settings.',
                ],
            },
            {
                title: '9. Policy updates and contact',
                paragraphs: [
                    `Material changes will be reflected in this policy with a revised effective date. For questions, complaints, or rights requests, email ${privacyEmail} or contact the municipal administrator responsible for your account.`,
                ],
            },
        ],
    },
    terms: {
        title: 'Terms of Use',
        effectiveDate,
        intro: `These Terms govern access to and use of Sibuyan Alert. By using the service, you agree to these Terms and the Privacy Policy. If you use the system for an agency or municipal office, you confirm that you are authorized to act for that organization.`,
        sections: [
            {
                title: '1. Purpose of the service',
                paragraphs: [
                    'Sibuyan Alert supports incident reporting, municipal verification, public-safety mapping, notifications, and coordination with eligible response units across Sibuyan Island. It is an operational support tool and is not a substitute for calling the appropriate emergency service during an immediate or life-threatening emergency.',
                ],
            },
            {
                title: '2. Accounts and authorized access',
                items: [
                    'Provide accurate, current information and keep account credentials confidential.',
                    'Use only your own account and promptly report suspected compromise or unauthorized access.',
                    'Reporter privileges may require identity and residency verification before incident submission is enabled.',
                    'Municipal administrators and responders may use restricted information only for their assigned duties, municipality, and lawful public-safety purposes.',
                ],
            },
            {
                title: '3. Incident reports and evidence',
                paragraphs: [
                    'You remain responsible for the accuracy and lawfulness of information you submit. Provide only information reasonably necessary to report the incident. By uploading evidence, you confirm that you have the right or lawful basis to provide it and grant the operator a limited permission to store, review, display to authorized users, and otherwise process it for incident verification and response.',
                ],
            },
            {
                title: '4. Prohibited conduct',
                items: [
                    'Submitting knowingly false, fabricated, duplicate, misleading, harassing, or malicious reports.',
                    'Uploading unlawful, unrelated, exploitative, or privacy-invasive content, malware, or content you are not entitled to provide.',
                    'Impersonating another person, sharing restricted information, or attempting to access another user’s account or municipality data.',
                    'Scraping, probing, reverse engineering, bypassing security controls, disrupting service availability, or using automated tools without written authorization.',
                    'Using incident information to harass, discriminate against, identify, or endanger reporters, victims, responders, or members of the public.',
                ],
            },
            {
                title: '5. Review, publication, and operational decisions',
                paragraphs: [
                    'Submitted reports may be reviewed, corrected, rejected, transferred, restricted, or removed by authorized administrators. Publication on the public map does not establish legal liability or guarantee that every detail is complete. Response, assignment, and resolution decisions remain with the authorized municipal offices and response agencies.',
                ],
            },
            {
                title: '6. Maps, location, and emergency limitations',
                paragraphs: [
                    'Map imagery, geocoding, boundaries, addresses, risk zones, and device location may be delayed, approximate, or unavailable. Users must verify critical location and safety information through official channels. Do not delay emergency assistance while waiting for the system, a notification, or an online response.',
                ],
            },
            {
                title: '7. Availability and changes',
                paragraphs: [
                    'The operator may maintain, update, suspend, or discontinue features to protect users, improve operations, comply with law, or address technical issues. Reasonable efforts are made to keep the service available, but uninterrupted or error-free operation is not guaranteed.',
                ],
            },
            {
                title: '8. Enforcement and account restriction',
                paragraphs: [
                    'Access may be limited, suspended, or terminated when reasonably necessary to investigate misuse, protect safety or data, comply with law, or enforce these Terms. Serious conduct may be referred to the appropriate authority. Where appropriate, affected users may contact the operator to request review.',
                ],
            },
            {
                title: '9. Ownership and permitted use',
                paragraphs: [
                    'The Sibuyan Alert software, interface, branding, and system-generated materials are protected by applicable intellectual-property rules. Users receive a limited, revocable, non-transferable right to use the service for its intended purpose. Users retain rights in their original submissions, subject to the limited operational permission described in these Terms.',
                ],
            },
            {
                title: '10. Privacy',
                paragraphs: [
                    'The Privacy Policy forms part of these Terms and explains how personal data is processed. Authorized users must follow confidentiality, security, and data-protection requirements applicable to their role.',
                ],
            },
            {
                title: '11. Disclaimers and responsibility',
                paragraphs: [
                    'To the extent allowed by law, the service is provided for public-safety support without a guarantee that every report, map feature, notification, estimate, or third-party service is accurate or continuously available. Nothing in these Terms excludes rights or liabilities that cannot lawfully be excluded. Users remain responsible for independent judgment and compliance with applicable law.',
                ],
            },
            {
                title: '12. Governing law and contact',
                paragraphs: [
                    `These Terms are governed by the laws of the Republic of the Philippines. Questions may be sent to ${privacyEmail} or directed to ${operatorName} at ${operatorAddress}. Material revisions will be identified by an updated effective date.`,
                ],
            },
        ],
    },
});

