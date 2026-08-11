# Google Sheets schema

Create these tabs and use the exact headers below. Header order may vary because
the portal maps by header name, but spelling must remain exact.

## Role_Requests

`Role_ID`, `Created_At`, `Status`, `Last_Updated_At`, `Last_Updated_By_Name`,
`Last_Updated_By_Email`, `Latest_Comments`, `Resume_Target_Status`,
`Requester_Name`, `Requester_Email`, `Requester_Type`, `Request_Type`,
`Department`, `Job_Title`, `Number_Of_Vacancies`, `Reason_For_Request`,
`Replacement_Employee`, `Target_Hiring_Date`, `Reporting_Manager`,
`Work_Location`, `Employment_Type`, `Job_Responsibilities`, `Required_Skills`,
`Experience_Required`, `Education_Requirements`, `Preferred_Qualifications`,
`Role_Expectations`, `Salary_Min`, `Salary_Max`, `Work_Schedule`,
`Job_Description`, `Screening_Criteria`, `Initial_Interview_Questions`,
`AI_Interviewer_Name`, `AI_Interviewer_Behavior`,
`Required_Interview_Question_1`, `Required_Interview_Question_2`,
`Required_Interview_Question_3`, `Final_AI_Evaluation_Template`,
`HOD_Availability_Dates`, `HOD_Availability_Times`,
`Custom_Screening_Question_1`, `Custom_Screening_Question_2`,
`AI_Screening_Questions`, `Notice_Period_Requirement`,
`Salary_Expectation_Guidance`, `Application_Link`, `Posting_Confirmed`,
`Posted_At`, `Posted_By`,
`AI_System_Prompt`, `Initial_Interview_Booking_Link`,
`HOD_Interview_Booking_Link`, `Posting_Channels`,
`Recruitment_Setup_Updated_At`, `Recruitment_Setup_Updated_By_Name`,
`Recruitment_Setup_Updated_By_Email`.

Stage-based Recruitment Setup also uses these exact Role_Requests columns:
`Recruitment_Setup_Status`, `Salary_Disclosure_Status`,
`Experience_Requirement_Status`, `License_Requirement_Status`,
`HOD_Interview_Required`, `Recruitment_Ready_At`, `Recruitment_Ready_By`,
`Ready_For_Publishing_At`, `Ready_For_Publishing_By`, `Posted_At`, and
`Posted_By`.

`Recruitment_Setup_Status` is `Draft`, `Recruitment Ready`,
`Ready for Publishing`, or `Published`. Draft saves do not make a role
`Job Posted`. The other option columns must contain explicit values before
publishing: salary `Disclosed` or `Not disclosed`, experience `Required` or
`Not required`, license `Required`, `Preferred`, or `Not required`, and HOD
interview `Required` or `Not required`.

Recruitment Setup also uses `License_or_Certificate_Required`,
`Keywords_to_Look_For`, `Minimum_Years_of_Experience`,
`Transferable_Skills_Accepted`, `Salary_or_Budget_Range`,
`Earliest_Availability_Rule`, and `Interview_Behavior`.

New writes use only `Status` and `Last_Updated_At`. `Request_Status` and
`Updated_At` are read-only migration fallbacks and must not be added to new
workflow writes.

## Role_Status_History

`History_ID`, `Role_ID`, `Changed_At`, `Changed_By_Name`, `Changed_By_Email`,
`Previous_Status`, `New_Status`, `Comments`, `Action_Source`,
`Action_Request_ID`, `Action`, `Access_Role`, `Department`,
`Resume_Target_Status`, `Notification_Status`, `Notification_Error`.

## Candidate_Status_History

`History_ID`, `Application_ID`, `Role_ID`, `Changed_At`, `Previous_Status`,
`New_Status`, `Stage`, `Action`, `Changed_By_Name`, `Changed_By_Email`,
`Comments`, `Rejection_Reason`, `Action_Source`.

## High_Match_Profile candidate fields

The portal reads and writes these candidate fields in `High_Match_Profile`:
`Application_ID`, `Role_ID`, `Candidate_Name`, `Email`, `Phone`,
`Preferred_Mobile`, `Resume_Text`, `Salary_Expectation`, `Notice_Period`,
`Availability`, `Skills_Assessment`, `Role_Expectations`,
`Application_Source`, `Final_Status`, `Resume_HR_Comments`,
`Voice_HR_Comments`, `Last_Updated`.

Binary resume files, DOCX uploads, and base64-encoded resume blobs must not be
stored in Google Sheets. Keep file storage separate and store only metadata plus
extracted text in the sheet.

## User_Directory

`Email`, `Full_Name`, `Access_Role`, `Department`, `Can_Create_Role`,
`Can_Review_Role`, `Can_Approve_Role`, `Can_Edit_Settings`, `Active`.

## Settings

`Setting_Key`, `Setting_Value`, `Category`, `Description`, `Updated_At`,
`Updated_By`. Never store webhook secrets, service-account private keys, or
other credentials in this tab.

## Optional Role_AI_Settings

`Role_ID`, `Job_Title`, `Department`, `License_or_Certificate_Required`,
`Keywords_to_Look_For`, `Minimum_Years_of_Experience`,
`Transferable_Skills_Accepted`, `Salary_Min`, `Salary_Max`,
`Earliest_Availability_Rule`, `Interview_Behavior`,
`Initial_Interview_Questions`, `AI_System_Prompt`, `Updated_At`,
`Updated_By_Name`, `Updated_By_Email`.
