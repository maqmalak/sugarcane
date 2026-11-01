---
title: Loading point operator and ELP auditor
roles: LP Operator, ELP Auditor
order: 40
---
# ELP — loading points and gate verification

## LP operator (ELP app on the phone)
1. Sign in to the **ELP** app with the mill's server, your e-mail and password.
   - A new phone must be approved by the Cane Manager.
   - You must be assigned to a loading point.
2. Set an **app PIN**. The app locks after 2 minutes in the background, and the PIN opens it again.
3. **Home** shows your loading point and the tabs: not sent, on the way, arrived, rejected.
4. When a vehicle is loaded, tap **Register**:
   - check that your **GPS is inside the loading point's geofence** (the app shows it);
   - scan or type the grower's **indent**;
   - enter the vehicle number, vehicle type, and the driver's name, CNIC and mobile.
5. Take the **ten photos** the app asks for:
   - number plate, indent, driver;
   - body left, body right, front, back;
   - chassis, LP board, and the cane.

   A blurred or dark photo is refused.
6. **Save**. The registration (ELP-26-…) goes to the mill as soon as there is internet. Nothing is lost offline: it waits in the outbox.
7. The vehicle shows **On the way** until it reaches the mill gate.

## At the mill gate
1. **ELP → Gate & verification**: scan the indent, or type the vehicle number or the ELP number, and click **Find**.
2. The gate cameras photograph the vehicle. The arrival time and journey minutes are recorded, against the standard and the average for that loading point.

## ELP auditor (web app)
1. Arrived loads wait in **Approvals inbox → Loads to verify** and **ELP → Pending verification**.
2. **Compare & verify** shows each loading point photo beside the same gate camera view:
   - plate, indent and driver;
   - body left and right, front and back.

   The chassis and LP board stay from the loading point. The journey and the route are shown on the map.
3. **Accept** if the vehicle, indent and load match. **Reject** with a reason if they don't.
   - An accepted load is *LP verified*: its indent is used, and the gate token is issued as *ELP Verified* with the loading point's TPT rate.
   - A rejected load comes in at the gate rates. The reason shows on the ELP dashboard.
4. Watch the **ELP dashboard** and **Loads**:
   - on the road (with the map), overdue, pending verification, accepted, rejected;
   - journey times per loading point.

## Reports
- *ELP Arrival Audit*: every arrival with GPS at the gate, journey against the standard, verdict and auditor.
- Also *ELP Pending Arrival*, *ELP Pending Verification*, *ELP Journey Time*, *ELP LP Wise Summary* and *ELP Vehicles Not Arrived*.
- In **Report Centre → ELP**, with Excel and PDF.

## Guides and videos
**Help → Guides & videos → ELP**: the A4 guide with phone and web screens, the ELP flow, and the video.
