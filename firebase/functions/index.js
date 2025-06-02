const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const xl = require("excel4node");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const manageServers = {
  TheZSATX: {
    managers: ["bchadventure@yahoo.com", "matthew@rocmtssolutions.com"],
  },
  dev: {
    managers: ["matthew@rocmtssolutions.com"],
  },
};

// Command to run to deploy this function:
// firebase deploy --only functions:generateDailyRegisterReport
// Command to run to deploy all functions: 
// firebase deploy --only functions

exports.generateDailyRegisterReport = onSchedule({schedule: "0 7 * * *", timeZone: "America/New_York", retryConfig: { maxAttempts: 3 }, minInstances: 0}, async (event) => {
  console.log("Starting daily register report generation...");
  for (const serverID of Object.keys(manageServers)) {
    try {
      console.log(`Starting daily register report for ${serverID}...`);
  
      const currentDate = new Date();
      const startDate = new Date(currentDate);
      startDate.setHours(startDate.getHours() - 24, 0, 0, 0);
      const endDate = new Date(currentDate);
  
      console.log(
        `Report Date: ${currentDate
          .toLocaleDateString("en-US")
          .replace(/\//g, "-")}`
      );
      console.log(`Start Date: ${startDate.toLocaleString("en-US")}`);
      console.log(`End Date: ${endDate.toLocaleString("en-US")}`);
  
      const ordersSnapshot = await db
        .collection("orders")
        .where("timestamp", ">", startDate)
        .where("timestamp", "<=", endDate)
        .where("access", "==", serverID)
        .get();
  
      if (ordersSnapshot.empty) {
        console.log("No orders found for " + serverID + ".");
        continue;
      }
  
      const ordersList = [];
      const productSales = {};
      const cashierMap = {};
      const customerMap = {};
      const productMap = {};
      const registerData = {};
  
      for (const doc of ordersSnapshot.docs) {
        const order = doc.data();
        const orderID = doc.id;
  
        let cashierName = "Unknown";
        if (order.cashier && typeof order.cashier === "string") {
          if (!cashierMap[order.cashier]) {
            try {
              const cashierDoc = await db
                .collection("users")
                .doc(order.cashier)
                .get();
              cashierMap[order.cashier] = cashierDoc.exists
                ? cashierDoc.data().displayName
                : "Unknown";
            } catch (err) {
              console.error(`Error fetching cashier ${order.cashier}:`, err);
              cashierMap[order.cashier] = "Unknown";
            }
          }
          cashierName = cashierMap[order.cashier];
        }
  
        let customerName = "Guest";
        if (order.customerID && typeof order.customerID === "string") {
          if (!customerMap[order.customerID]) {
            try {
              const customerDoc = await db
                .collection("members")
                .doc(order.customerID)
                .get();
              customerMap[order.customerID] = customerDoc.exists
                ? customerDoc.data().name
                : "Guest";
            } catch (err) {
              console.error(
                `Error fetching customer ${order.customerID}:`,
                err
              );
              customerMap[order.customerID] = "Guest";
            }
          }
          customerName = customerMap[order.customerID];
        }
  
        const productNames = [];
        if (Array.isArray(order.products)) {
          for (const productID of order.products) {
            if (typeof productID === "string" && productID.trim() !== "") {
              if (!productMap[productID]) {
                try {
                  const productDoc = await db
                    .collection("products")
                    .doc(productID)
                    .get();
                  productMap[productID] = productDoc.exists
                    ? productDoc.data().name
                    : "Unknown Product";
                } catch (err) {
                  console.error(`Error fetching product ${productID}:`, err);
                  productMap[productID] = "Unknown Product";
                }
              }
              productNames.push(productMap[productID]);
  
              productSales[productMap[productID]] =
                (productSales[productMap[productID]] || 0) + 1;
            }
          }
        }
  
        ordersList.push({
          "Order ID": orderID,
          Cashier: cashierName,
          Customer: customerName,
          Products: productNames.join(", "),
          Subtotal: order.total?.[0] || 0,
          Tax: order.total?.[1] || 0,
          Total: order.total?.[2] || 0,
          "OG Total": order.total?.[3] || 0,
          "Credit Card": order.paymentMethod?.[0] || 0,
          "Gift Card": order.paymentMethod?.[1] || 0,
          Cash: order.paymentMethod?.[2] || 0,
          Timestamp: order.timestamp?.toDate() || "N/A",
        });
      }
  
      const registersSnapshot = await db
        .collection("registers")
        .where("timestampStart", ">", startDate)
        .where("timestampEnd", "<=", endDate)
        .where("access", "==", serverID)
        .get();
  
      for (const doc of registersSnapshot.docs) {
        const register = doc.data();
        const cashier = register.uname || "Unknown";
        registerData[cashier] = {
          "Register ID": doc.id,
          Cashier: cashier,
          "Starting Amount": register.starting || 0,
          "Ending Amount": register.ending || 0,
          "Payout Slips": register.PSN || 0,
          "Payout Slip Amount": register.PSA || 0,
          "Credit Card Total": register.ccard || 0,
          "Timestamp Start": register.timestampStart?.toDate() || "N/A",
          "Timestamp End": register.timestampEnd?.toDate() || "N/A",
        };
      }
  
      const wb = new xl.Workbook();
      const headerStyle = wb.createStyle({
        font: { bold: true, size: 12 },
        alignment: { horizontal: "center" },
      });
  
      const moneyStyle = wb.createStyle({
        numberFormat: "$#,##0.00; ($#,##0.00); -",
      });
  
      const orderSheet = wb.addWorksheet("Orders");
      const headers = [
        "Order ID",
        "Cashier",
        "Customer",
        "Products",
        "Subtotal",
        "Tax",
        "Total",
        "OG Total",
        "Credit Card",
        "Gift Card",
        "Cash",
        "Timestamp",
      ];
  
      headers.forEach((header, i) =>
        orderSheet
          .cell(1, i + 1)
          .string(header)
          .style(headerStyle)
      );
  
      let row = 2;
      for (const order of ordersList) {
        Object.values(order).forEach((value, i) => {
          if (typeof value === "number") {
            orderSheet
              .cell(row, i + 1)
              .number(value)
              .style(moneyStyle);
          } else {
            orderSheet.cell(row, i + 1).string(String(value));
          }
        });
        row++;
      }
  
      const productSheet = wb.addWorksheet("Product Sales");
      productSheet.cell(1, 1).string("Product Name").style(headerStyle);
      productSheet.cell(1, 2).string("Quantity Sold").style(headerStyle);
      row = 2;
      for (const [product, quantity] of Object.entries(productSales)) {
        productSheet.cell(row, 1).string(product);
        productSheet.cell(row, 2).number(quantity);
        row++;
      }
  
      for (const [cashier, register] of Object.entries(registerData)) {
        const sheet = wb.addWorksheet(`Register - ${cashier}`);
        let row = 1;
        for (const [key, value] of Object.entries(register)) {
          sheet.cell(row, 1).string(key).style(headerStyle);
          sheet.cell(row, 2).string(String(value));
          row++;
        }
      }
  
      const tempFilePath = "/tmp/" + currentDate.toLocaleDateString("en-US").replace(/\//g, "-") + "_Daily_Register_Report_" + serverID + ".xlsx";
      await new Promise((resolve, reject) => {
        wb.write(tempFilePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
  
      await bucket.upload(tempFilePath, {
        destination: "reports/" + currentDate.toLocaleDateString("en-US").replace(/\//g, "-") + "_Daily_Register_Report_" + serverID + ".xlsx",
      });
  
      const file = bucket.file("reports/" + currentDate.toLocaleDateString("en-US").replace(/\//g, "-") + "_Daily_Register_Report_" + serverID + ".xlsx");
  
      await file.makePublic();
  
      const url = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
  
      const mailRef = db.collection("mail").doc();
      await mailRef.set({
        to: manageServers[serverID].managers,
        message: {
          html: `Attached is the daily register report for ${serverID} on ${currentDate.toLocaleDateString(
            "en-US"
          )}. <a href="${url}">Download Report</a>`,
          subject: `Daily Register Report for ${serverID} - ${currentDate.toLocaleDateString(
            "en-US"
          )}`,
          text: `Attached is the daily register report for ${serverID} on ${currentDate.toLocaleDateString(
            "en-US"
          )}. Download the report here: ${url}`,
        },
      });
  
      console.log("✅ Report successfully generated and saved. (" + serverID + ")");
      console.log("📊 Report URL (" + serverID + "):", url);
    } catch (error) {
      console.error("Error generating daily register report:", error);
    }
  }
});
