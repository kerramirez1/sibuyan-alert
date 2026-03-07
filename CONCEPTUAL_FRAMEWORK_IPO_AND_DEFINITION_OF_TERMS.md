# Conceptual Framework (IPO) and Definition of Terms

## System Title
**Sibuyan Alert: Accident Alert and Mapping System for Sibuyan Island**

## Conceptual Framework Using IPO

The study adopts the **Input-Process-Output (IPO) Model** to describe how the system transforms collected data and user actions into actionable emergency information, response coordination, and analytical insights.

### IPO Matrix

| IPO Component | Description | System Elements |
|---|---|---|
| **Input** | Resources, data, and requirements needed by the system | User registration data, role and ID verification data, incident details (type, severity, description), location data (GPS/manual pin), uploaded images, municipality references (Cajidiocan/Magdiwang/San Fernando), high-risk zone records, user credentials and session tokens |
| **Process** | Operations and workflows that transform inputs | Authentication and role-based access control, reporter verification workflow, report submission validation, geolocation processing and municipality assignment, geofencing-based alert routing, admin review (verify/reject), responder assignment and response workflow, report status lifecycle (pending/verified/responding/resolved/rejected), real-time socket events and notifications, data aggregation for analytics and public map rendering |
| **Output** | Final information, services, and decision-support results | Real-time incident alerts, verified incident list, municipality-scoped report visibility, response status updates, high-risk zone visualization, public accident map and history, notifications for reporters/admin/responders, dashboard analytics (counts, trends, recent incidents), incident records for planning and risk reduction |

### IPO Flow (Narrative)

1. **Input Stage:** The system gathers user account data, report details, location coordinates, and supporting evidence (images), alongside administrative configuration such as municipality and zone data.
2. **Process Stage:** The backend validates and classifies reports, routes incidents to the correct municipality, triggers verification and response workflows, updates statuses, and pushes real-time updates to relevant users.
3. **Output Stage:** Stakeholders receive live alerts, mapped incidents, response progress, and analytics that support faster emergency coordination and long-term safety planning.

### Conceptual Diagram (Text Form)

**Input** -> **Process** -> **Output**

- **Input:** Reporter/Admin/Responder data, incident and location data, verification and zoning data
- **Process:** Validation, geofencing, approval/rejection, response handling, notifications, analytics computation
- **Output:** Alerted stakeholders, mapped/filtered incidents, response visibility, decision-support analytics

---

## Definition of Terms

This section provides the conceptual and operational definition of technical terms, acronyms, and variables used in this study.

In this study, **"Accident Alert and Mapping System"** referred to a web-based platform used to report road incidents, map locations, and support emergency coordination in Sibuyan Island. (Azeez, Ogunrinde, & Adeleye, 2015)

In this study, **"Administrator (Admin)"** referred to an authorized account with full system privileges, including user management, incident oversight, and analytics monitoring. (Operational definition by the proponents, 2026)

In this study, **"Municipal Administrator"** referred to an admin-level account assigned to a specific municipality (Cajidiocan, Magdiwang, or San Fernando) with jurisdiction-limited management access. (Operational definition by the proponents, 2026)

In this study, **"Responder"** referred to an authorized emergency personnel account (e.g., MDRRMO, PNP, BFP, SDH) that handles verified incidents and updates response status. (Amin, Bhuiyan, Reaz, & Nasir, 2013)

In this study, **"Reporter"** referred to a verified user account allowed to submit incident reports with details and supporting evidence. (Operational definition by the proponents, 2026)

In this study, **"Ordinary User"** referred to a general user with limited access, primarily for viewing public safety information. (Operational definition by the proponents, 2026)

In this study, **"Incident Report"** referred to a structured record containing incident type, severity, description, timestamp, location, and optional image attachments. (Azeez, Ogunrinde, & Adeleye, 2015)

In this study, **"Incident Type"** referred to the category of road-related incident such as vehicular, motorcycle, pedestrian, bicycle, maritime, or other related events. (Edan, Aliyu, & Sarkinzango, 2013)

In this study, **"Severity Level"** referred to the degree of incident intensity (minor, moderate, severe, or critical) used for prioritization and response planning. (Edan, Aliyu, & Sarkinzango, 2013)

In this study, **"Verification"** referred to the process performed by authorized administrators to confirm whether a submitted incident report is legitimate and actionable. (Operational definition by the proponents, 2026)

In this study, **"Status Lifecycle"** referred to the progression of each report as pending, verified, responding, resolved, or rejected. (Operational definition by the proponents, 2026)

In this study, **"Real-Time Notification"** referred to instant in-app or socket-based alerts delivered to relevant users when report-related events occur. (Sevandal et al., 2024)

In this study, **"Geofencing"** referred to the location-based routing mechanism that directs incident alerts to the correct municipality based on report coordinates. (Amin, Bhuiyan, Reaz, & Nasir, 2013)

In this study, **"High-Risk Zone"** referred to a mapped area identified as accident-prone or hazardous based on historical incidents and administrative records. (Souleyrette et al., 1998)

In this study, **"Public Safety Map"** referred to the visual map interface used to display verified incidents and risk zones for awareness and monitoring. (Souleyrette et al., 1998)

In this study, **"Dashboard Analytics"** referred to summarized metrics and trends (counts, statuses, recency, and location distribution) used for operational decision support. (Ansari & Al-Shabi, 2012)

In this study, **"GPS Capture"** referred to the automatic retrieval of latitude and longitude from a device for accurate incident geotagging. (Patil & Pardeshi, 2023)

In this study, **"Manual Location Input"** referred to an alternative method of selecting or encoding incident location when automatic GPS is unavailable or inaccurate. (Fanca, Pu?ca?iu, & Valean, 2016)

In this study, **"Role-Based Access Control (RBAC)"** referred to the security mechanism that limits system features and data access according to user role. (Operational definition by the proponents, 2026)

In this study, **"Data Integrity"** referred to the consistency, validity, and reliability of report, user, and system records across all operations. (Operational definition by the proponents, 2026)

---

## Summary

Using the IPO framework, the system is conceptualized as a transformation pipeline where validated emergency inputs are processed through secure, municipality-aware, and real-time workflows to produce actionable outputs for residents, responders, and local government decision-makers.


