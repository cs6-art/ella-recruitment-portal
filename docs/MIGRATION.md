# Sheet migration notes

`Role_Requests` should use `Status` and `Last_Updated_At` for all new rows and
writes. Existing `Request_Status` and `Updated_At` values are read only as
temporary fallbacks so older rows remain visible. Copy those values into the
canonical columns, then remove the legacy columns only after verification.

Required `Role_Requests` columns include `Role_ID`, `Status`, `Created_At`,
`Last_Updated_At`, `Last_Updated_By_Name`, `Last_Updated_By_Email`,
`Latest_Comments`, `Resume_Target_Status`, `Notification_Status`,
`Notification_Error`, `Management_Comments`, `Approved_By`, `Approved_At`,
`Job_Description`, `Screening_Criteria`, `Initial_Interview_Questions`,
`AI_System_Prompt`, `Initial_Interview_Booking_Link`,
`HOD_Interview_Booking_Link`, `Posting_Channels`,
`Recruitment_Setup_Updated_At`, `Recruitment_Setup_Updated_By_Name`, and
`Recruitment_Setup_Updated_By_Email`.

Required `Role_Status_History` columns are `History_ID`, `Action_Request_ID`,
`Role_ID`, `Changed_At`, `Previous_Status`, `New_Status`, `Action`,
`Changed_By_Name`, `Changed_By_Email`, `Access_Role`, `Department`, `Comments`,
`Resume_Target_Status`, `Notification_Status`, `Notification_Error`, and
`Action_Source`.

Required `Settings` columns are `Setting_Key`, `Setting_Value`, `Category`,
`Description`, `Updated_At`, and `Updated_By`.

Add these structured Recruitment Setup columns to `Role_Requests` before using
the structured screening controls: `License_or_Certificate_Required`,
`Keywords_to_Look_For`, `Minimum_Years_of_Experience`,
`Transferable_Skills_Accepted`, `Salary_or_Budget_Range`,
`Earliest_Availability_Rule`, and `Interview_Behavior`.

## Interview availability rules

Add the optional `Interview_Availability_Rules` column to `Role_Requests`.
New availability is stored as recurring or specific rules and rendered as
virtual times. Do not delete existing `Interview_Slots` rows during migration:
booked rows remain the source of truth for appointments, while unbooked rows
continue to display for backward compatibility and are deduplicated against
virtual rules by role, interview type, date, start time, end time, and timezone.

When converting an existing schedule, create one rule per recurring window
where the date range, weekday set, timezone, and slot duration are known. Keep
exceptions as specific-slot rules. Past unbooked rows are displayed as
`Expired`; active unbooked legacy rows remain available until they are
replaced or archived. Booked, blocked, and cancelled rows are never converted
or removed automatically.

The calendar UI now summarizes counts by date and opens the individual times
in a date-detail view. Candidate links query only future times and perform a
final server-side availability check before writing a booking, including a
Google Calendar free/busy check for final interviews.
