# HR Resume Screening historical import

<!-- Data note: this workbook combines retained exports with clearly marked
     synthetic rows for six-month reporting and import testing. -->

Import-ready workbook: `HR Resume Screening - 6 Month Import.xlsx`

## Sheets

- `README` — workbook notes and provenance.
- `High_Match_Profile` — 112 rows total.
- `Call_Logs` — 105 rows total.

## Date range and provenance

The workbook covers **2026-03-01 through 2026-08-17**. Existing source rows were retained, and 90 synthetic rows were added to each operational sheet so the six-month history is populated for demonstration and testing.

Synthetic records are marked with `APP-SYN-` application IDs. Synthetic email addresses use `example.invalid`, and synthetic recording links use `example.invalid` so they cannot be mistaken for live contact or recording data.

This generated history is dummy data and must not be treated as actual applicant or call records.

## Import into Google Sheets

In Google Sheets, choose **File → Import → Upload**, select the `.xlsx` file, and import it as a new spreadsheet or replace the current spreadsheet. The `High_Match_Profile` and `Call_Logs` tabs are the operational tabs to use for reporting or downstream imports.
