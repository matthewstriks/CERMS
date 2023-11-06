const devMode = true;
const { app, BrowserWindow, ipcMain, dialog, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const xl = require('excel4node');
const { initializeApp } = require("firebase/app");
const { getAuth, updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updatePassword } = require("firebase/auth");
const { collection, onSnapshot, query, where, getFirestore, doc, deleteDoc, setDoc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp, orderBy, limit, FieldValue, arrayUnion, increment } = require("firebase/firestore");
const { getStorage, ref, getDownloadURL } = require("firebase/storage");
const { log } = require('console');
const delay = require('delay');
const { address } = require('address');
const os = require('os');
const theHostName = os.hostname();

/*
  getDownloadURL(ref(storage, 'product-images/286x180.svg'))
  .then((url) => {
    console.log(url);
    })
  .catch((error) => {
    console.log(error);
  });
*/

// Live
const firebaseConfig = {
  apiKey: "AIzaSyBLgcEx6bUsvCxZo6_Ieyo23J3duVQSjo4",
  authDomain: "cerms-7af24.firebaseapp.com",
  projectId: "cerms-7af24",
  storageBucket: "cerms-7af24.appspot.com",
  messagingSenderId: "448459034729",
  appId: "1:448459034729:web:f73e546ecd1ceb9bd8d2f8",
  measurementId: "G-Y7RNQZP9KB",
  databaseURL: "gs://cerms-7af24.appspot.com"
};

function initializeAppFunct(){
  firebaseApp = initializeApp(firebaseConfig);
}

const startInitApp = initializeAppFunct();
const db = getFirestore(firebaseApp);
const auth = getAuth();
const storage = getStorage(); 
const members = Array();
const membersData = Array();
const activitys = Array();
const activitysData = Array();
const categories = Array();
const categoriesData = Array();
const products = Array();
const productsData = Array();
const discounts = Array();
const discountsData = Array();
const orders = Array();
const ordersData = Array();

let mainWin;
let uploadImgWin;
let recieptWin;
let recieptWinChild;
let theClient;
let theClient2;
let theProductImgID;
let loadingProgress;
let systemData;
let user;
let userData;
let loginCreds;
let startGatherAllMembersA = false
let startGatherAllActivityA = false
let startGatherAllCategoryA = false
let startGatherAllProductsA = false
let startGatherAllDiscountsA = false
let startGatherAllOrdersA = false

let pendingOrderType;
let pendingOrderInfo;
let pendingOrderID;
let lastMemberCreated;

let regStatus = false;
let regStatusID = false;
let regStatusShift = false;

let autoLogin = true

let liveVersion;
let theAppVersion;

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

async function getVersionLive() {
  const response = await fetch('https://matthewstriks.com/cerms/version.txt');
  liveVersion = await response.text();
  theAppVersion = app.getVersion()
  if (liveVersion != theAppVersion) {
    notificationSystem('warning', 'New Version Available! (' + liveVersion + ')')
  }
}

function loadAuth(){
  mainWin.unmaximize()
  mainWin.loadFile(path.join(__dirname, 'login.html'));
}

function goHome(firstTime){
  mainWin.loadFile(path.join(__dirname, 'home.html'));
  mainWin.maximize()
  setTimeout(() => {
    if (firstTime) {
      getVersionLive()
    }
  }, 1000);
}

function goOrder(){
  mainWin.loadFile(path.join(__dirname, 'order.html'));
  mainWin.maximize()
}

function goRegister(){
  mainWin.loadFile(path.join(__dirname, 'register.html'));
  mainWin.maximize()
}

async function goProducts(){
  mainWin.loadFile(path.join(__dirname, 'products.html'));
  mainWin.maximize()
}

async function goAccount(){
  mainWin.loadFile(path.join(__dirname, 'account.html'));
  mainWin.maximize()
}

function goMembers(){
  mainWin.loadFile(path.join(__dirname, 'members.html'));
}

function getEMail(){
  return userData.email;
}

async function getEMailByID(theUserID){
  const docRef = doc(db, "users", theUserID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().email;
  } else {
    return false;
  }

  return userData.email;
}

function getDisplayName(){
  return userData.displayName;
}

function getRank(){
  return userData.rank;
}

function canUser(theFunction){
  return userData[theFunction];
}

function getUID(){
  return user.uid;
}

function notificationSystem(notificationType, notificationMsg){
  theClient.send('notification-system', Array(notificationType, notificationMsg))
}

async function getMemberInfo(memberID){
  if (memberID == -1) {
    return false
  }
  const docRef = doc(db, "members", memberID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  } else {
    return false;
  }
}

async function getMemberEMail(memberID){
  if (!memberID || memberID <= 0) {
    return false
  }
  const docRef = doc(db, "members", memberID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().email;
  } else {
    return false;
  }
}

async function getMemberFromActivity(activityID){
  const docRef = doc(db, "activity", activityID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().memberID;
  } else {
    return false;
  }
}

async function resetUserPassword(theEmailPass, theUserID){
  let theEmail;
  if (theEmailPass == 0) {
    theEmail = await getEMailByID(theUserID);
  }else if (theEmailPass) {
    theEmail = theEmailPass;
  } else {
    theEmail = await getEMail();
  }

  sendPasswordResetEmail(auth, theEmail)
    .then(() => {
      notificationSystem('success', 'Password reset email has been sent! Check your email.')
    })
    .catch((error) => {
      console.log(error);
      const errorCode = error.code;
      const errorMessage = error.message;
      notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
    });
}

async function updateMembershipEMail(memberID, newEMail){
  const docRef = doc(db, "members", memberID);
  await updateDoc(docRef, {
    email: newEMail
  });
}

async function updateMembership(memberID, theOldDoc, memberInfo){
  let idExpiration = "";
  let theCurrentTime = Math.floor(Date.now() / 1000);

  let theProductInfo
  productsData.forEach(product => {
    if (product[1].name == memberInfo[3]) {
      theProductInfo = product
    }
  });

  idExpiration = theCurrentTime + theProductInfo[1].membershipLength

  const docRef = doc(db, "members", memberID);
  await updateDoc(docRef, {
    notes: theOldDoc.notes + " // " + memberInfo[4],
    dna: false,
    id_expiration: idExpiration,
    membership_type: memberInfo[3]
  });
  theClient.send('membership-success', memberID)
}

async function memberDNA(memberInfo){
  const docRef = doc(db, "members", memberInfo);
  await updateDoc(docRef, {
    dna: true,
  });
}

async function memberUNDNA(memberInfo){
  const docRef = doc(db, "members", memberInfo);
  await updateDoc(docRef, {
    dna: false,
  });
}

async function memberTag(memberInfo){
  const docRef = doc(db, "members", memberInfo);
  await updateDoc(docRef, {
    tag: true,
  });
}

async function memberUNTag(memberInfo){
  const docRef = doc(db, "members", memberInfo);
  await updateDoc(docRef, {
    tag: false,
  });
}

async function renewActivity(memberInfo){
  notificationSystem('warning', 'Renewing time...')
  let theUserID = getUID();
  let theCurrentTime = memberInfo[1][4];
  let theCurrentTimeExp = memberInfo[1][5];
  let theTimeToAdd = systemData.renewTime * 3600
  let theTimeExpire = theCurrentTimeExp + theTimeToAdd;
  const docRef = doc(db, "activity", memberInfo[0]);
  await updateDoc(docRef, {
    lockerRoomStatus: Array(
      memberInfo[1][0],
      memberInfo[1][1],
      memberInfo[1][2],
      theUserID,
      theCurrentTime,
      theTimeExpire
    )
  });
  notificationSystem('success', 'Time renewed!')
}

async function createMail(toWho, theSubject, theText, theHTML, attachmentFile){
  const docRef = await addDoc(collection(db, "mail"), {
    to: toWho,
    message: {
      subject: theSubject,
      text: theText,
      html: theHTML,
    }
  });
}

async function createCategory(catName, catDesc, catColor){
  notificationSystem('warning', 'Creating category...')
  let userAllowed = canUser('permissionEditCategory')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  const docRef = await addDoc(collection(db, 'categories'), {
    name: catName,
    desc: catDesc,
    color: catColor
  });
  notificationSystem('success', 'Category created!')
  goProducts()
}

async function createProduct(proCat, proName, proPrice, proInvWarn, proDesc, proInv, proTaxable, proActive, proCore, proRental, proMembership, proMembershipLength, proMembershipLengthType, proInvPar, proBarcode){
  notificationSystem('warning', 'Creating Product...')
  let userAllowed = canUser('permissionEditProducts')
  let userAllowedCore = canUser('permissionEditCoreProducts')
  let theProCore = false;
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  if (proCore) {
    theProCore = true
  }
  if (!userAllowedCore && proCore) {
    notificationSystem('danger', 'No permissions to make this product core...')
    theProCore = false
  }
  let theMembershipLength = false
  if (proMembership) {
    let theMultiple
    if (proMembershipLengthType == 'hour') {
      theMultiple = 3600
    } else if (proMembershipLengthType == 'day') {
      theMultiple = 86400      
    } else if (proMembershipLengthType == 'week') {
      theMultiple = 604800      
    } else if (proMembershipLengthType == 'month') {
      theMultiple = 2.628e+6
    } else if (proMembershipLengthType == 'year') {
      theMultiple = 3.154e+7
    }
    theMembershipLength = proMembershipLength * theMultiple
  }
  const docRef = await addDoc(collection(db, 'products'), {
    cat: proCat,
    name: proName,
    price: proPrice,
    invWarning: proInvWarn,
    desc: proDesc,
    inventory: proInv,
    inventoryPar: proInvPar,
    taxable: proTaxable,
    active: proActive,
    core: theProCore,
    rental: proRental,
    membership: proMembership,
    membershipLength: theMembershipLength,
    membershipLengthRaw: proMembershipLength,
    membershipLengthType: proMembershipLengthType,
    barcode: proBarcode,
    image: false
  });
  notificationSystem('success', 'Product Added!')
  goProducts()

  createUploadImageScreen()
  theProductImgID = docRef.id
}

async function createDiscount(discCode, discDollar, discPercent, discAmount, discAS, discASPro, discExpDate, discTypeP, discTypeO, discLimit, discUsed){
  notificationSystem('warning', 'Creating Discount...')
  let d = new Date(discExpDate).getTime();
  let userAllowed = canUser('permissionEditDiscounts')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }

  let theDiscLimit

  if (discLimit) {
    theDiscLimit = Number(discLimit)
  } else {
    theDiscLimit = false
  }

  const docRef = await addDoc(collection(db, 'discounts'), {
    code: discCode,
    dollar: discDollar,
    percent: discPercent,
    amount: discAmount,
    asCheck: discAS,
    asPro: discASPro,
    expires: d,
    typeProduct: discTypeP,
    typeOrder: discTypeO,
    limit: theDiscLimit,
    used: discUsed
  });
  notificationSystem('success', 'Discount Added!')
  goProducts()
}

async function createOrder(memberInfo, orderType, thePendingOrder){
  await goOrder()
  if (!regStatus) {
    setTimeout(() => {
      notificationSystem('warning', 'There is no register currently active. You must activate a register to create an order.')
    }, 1000);    
    setTimeout(() => {
      goRegister()
    }, 3000);    
    return
  }

  pendingOrderType = orderType
  let theMembersData
  if (memberInfo[0]) {
    theMembersData = await getMemberInfo(memberInfo[0]);
    theMembersName = theMembersData.name;
    pendingOrderInfo = thePendingOrder
  }else{
    theMembersName = memberInfo[2]
    pendingOrderInfo = thePendingOrder
  }
  setTimeout(function(){
    theClient.send('send-customer-info', Array(theMembersName, theMembersData, memberInfo[0]))
    productsData.forEach((item, i) => {
      if (item[1].name == memberInfo[1]) {        
        theClient.send('send-product-info', item)
      }
    });
  }, 1000)
}

async function viewOrderReciept(theOrderNumber){
  let p2 = path.join(__dirname, '.', 'last-reciept.html');
  let theReciept = ""

  const querySnapshot = await getDocs(collection(db, "orders"));
  querySnapshot.forEach((doc) => {
    if (doc.id == theOrderNumber) {
      theReciept = doc.data().reciept
      fs.writeFile(p2, theReciept, err => {
        if (err) {
          console.error(err);
        }
        createRecieptScreen(true)
      });
    }
  });
}

async function recieptProcess(orderInfo, theOrderNumber){
  let recieptStyle = orderInfo[6]
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let theDisplayName = await getDisplayName()
  let theEMail = orderInfo[7]
  let theCustomersEMail = await getMemberEMail(orderInfo[0])    
  let p2 = path.join(__dirname, '.', 'last-reciept.html');

  let theHTML
  let withDate
  let withOrder
  let withSub
  let withTax
  let withTotal
  let withPayment
  let withCashier
  let withProductsTxt
  let theDiscountsUsed
  let withDiscounts
  let withDiscountsTxt = ""

  if (theEMail && theCustomersEMail) {
    if (theCustomersEMail != theEMail) {
      updateMembershipEMail(orderInfo[0], theEMail)
    }    
  }

  theHTML = systemData.reciept
  withDate = theHTML.replace('TheDate', theStringTime)
  withOrder = withDate.replace('OrderNumber', theOrderNumber)

  withSub = withOrder.replace('TheSubtotal', formatter.format(Math.round((Number(orderInfo[3][0]) + Number.EPSILON) * 100) / 100))
  withTax = withSub.replace('TheTax', formatter.format(Math.round((Number(orderInfo[3][1]) + Number.EPSILON) * 100) / 100))
  withTotal = withTax.replace('TheTotal', formatter.format(Math.round((Number(orderInfo[3][2]) + Number.EPSILON) * 100) / 100))

  withPayment = withTotal.replace('TheTotalPaymentMethod', '<b>Credit/Debit Card: </b>' + formatter.format(Math.round((Number(orderInfo[4][0]) + Number.EPSILON) * 100) / 100) + '<br><b>Gift Card: </b>' + formatter.format(Math.round((Number(orderInfo[4][1]) + Number.EPSILON) * 100) / 100) + '<br><b>Cash: </b>' + formatter.format(Math.round((Number(orderInfo[4][2]) + Number.EPSILON) * 100) / 100))

  withCashier = withPayment.replace('TheCashier', theDisplayName)
  withProductsTxt = ""

  theDiscountsUsed = orderInfo[5]

  if (theDiscountsUsed.length == 0) {
    theDiscountsUsed.push(Array(0, 0))
  }

  orderInfo[1].forEach(async (productSel, i) => {
    let theProductInfo = await getProductInfo(productSel)
    withProductsTxt = withProductsTxt + '<tr><td>' + theProductInfo.name + '</td><td>1</td><td>x</td><td>' + formatter.format(Number(theProductInfo.price)) + '</td><td>' + formatter.format(Number(theProductInfo.price)) + '</td></tr>'
    if (orderInfo[1].length == (i + 1)) {
      let withProducts = withCashier.replace('ProductsHere', withProductsTxt)

      if (orderInfo[2]) {
        if (orderInfo[2][1].dollar) {
          withDiscountsTxt = withDiscountsTxt + '<tr><td>' + orderInfo[2][1].code + '</td><td>' + formatter.format(Math.round((Number(orderInfo[2][1].amount) + Number.EPSILON) * 100) / 100) + ' (entire order)</td><td>' + formatter.format(Math.round((Number(orderInfo[2][1].amount) + Number.EPSILON) * 100) / 100) + '</td></tr>'
        } else {
          let thePer = (orderInfo[2][1].amount / 100)
          let theOff = Number(orderInfo[3][3]) * thePer
          let theProductPrice = Number(orderInfo[3][3]) - theOff
          let amountSaved = Number(orderInfo[3][3]) - theProductPrice
          withDiscountsTxt = withDiscountsTxt + '<tr><td>' + orderInfo[2][1].code + '</td><td>' + orderInfo[2][1].amount + '% (entire order)</td><td>' + formatter.format(Math.round((Number(amountSaved) + Number.EPSILON) * 100) / 100) + '</td></tr>'
        }
      }
      theDiscountsUsed.forEach(async (discountSel, i2) => {
        if (discountSel[0] != 0) {
          let theDiscountProductInfo = await getProductInfo(discountSel[0])
          let theDiscountInfo = await getDiscountInfo(discountSel[1])
          if (theDiscountInfo.dollar) {
            withDiscountsTxt = withDiscountsTxt + '<tr><td>' + theDiscountInfo.code + '</td><td>' + formatter.format(Math.round((Number(theDiscountInfo.amount) + Number.EPSILON) * 100) / 100) + '</td><td>' + formatter.format(Math.round((Number(theDiscountInfo.amount) + Number.EPSILON) * 100) / 100) + '</td></tr>'
          } else {
            let thePer = (theDiscountInfo.amount / 100)
            let theOff = theDiscountProductInfo.price * thePer
            let theProductPrice = theDiscountProductInfo.price - theOff
            let amountSaved = theDiscountProductInfo.price - theProductPrice
            withDiscountsTxt = withDiscountsTxt + '<tr><td>' + theDiscountInfo.code + '</td><td>' + theDiscountInfo.amount + '%</td><td>' + formatter.format(Math.round((Number(amountSaved) + Number.EPSILON) * 100) / 100) + '</td></tr>'
          }
        }
        if (orderInfo[5].length == (i2 + 1)) {
          if (!withDiscountsTxt) {
            withDiscountsTxt = ""
          }
          withDiscounts = withProducts.replace('TheDiscountsApplied', withDiscountsTxt)
          const orderRef = doc(db, "orders", theOrderNumber);
          await updateDoc(orderRef, {
            reciept: withDiscounts
          });
          if (recieptStyle == 1) {
            fs.writeFile(p2, withDiscounts, err => {
              if (err) {
                console.error(err);
              }
              createRecieptScreen(false)
            });
          } else if (recieptStyle == 2) {
            createMail(theEMail, 'Reciept!', withDiscounts, withDiscounts)
          } else if (recieptStyle > 2) {
            fs.writeFile(p2, withDiscounts, err => {
              if (err) {
                console.error(err);
              }
              createRecieptScreen(false)
              createMail(theEMail, 'Reciept!', withDiscounts, withDiscounts)
            });
          }
        }
      })
    }
  });
}

async function completeOrder(orderInfo){
  console.log(orderInfo);
  if (!regStatus) {
    setTimeout(() => {
      notificationSystem('warning', 'There is no register currently active. You must activate a register to create an order.')
    }, 1000);
    setTimeout(() => {
      goRegister()
    }, 3000);    
    return
  }
  let theTimestamp = new Date(Math.floor(Date.now() / 1000))
  let theCustomerID = orderInfo[0]
  if (!theCustomerID) {
    theCustomerID = 0
  }

  if (orderInfo[2]) {
    const washingtonRef = doc(db, "discounts", orderInfo[2][0]);

    // Atomically increment the population of the city by 50.
    await updateDoc(washingtonRef, {
      used: increment(1)
    });
  }

  // paymentMethod: credit card, gift card, cash
  const docRef = await addDoc(collection(db, "orders"), {
    customerID: theCustomerID,
    products: orderInfo[1],
    discounts: orderInfo[2],
    total: orderInfo[3],
    paymentMethod: orderInfo[4],
    cashier: getUID(),
    timestamp: serverTimestamp()
  });

  let registerInfo = await getActiveRegister()
  updateRegisterSub(registerInfo, orderInfo[4], orderInfo[3], false)

  if (pendingOrderType == 'membership') {
    pendingOrderID = docRef.id
    goMembers()
    setTimeout(function(){
      orderInfo[1].forEach(product => {
        productsData.forEach(mproduct => {
          if(product == mproduct[0]){
            if (mproduct[1].rental) {
              setTimeout(function(){
                createActivity(Array(lastMemberCreated, mproduct[1].name, orderInfo[8], orderInfo[9], false, false))
              }, 3000);
            }
          }
        })
      });
      createMembership(pendingOrderInfo);
    }, 1000)
  }else if (pendingOrderType == 'updatemembership') {
    goMembers()
    setTimeout(function () {
      editMembership(pendingOrderInfo);
    }, 1000)
  }else if (pendingOrderType == 'activity') {
    goHome()
    setTimeout(function () {
      createActivity(pendingOrderInfo)
    }, 1000)
  }else if (pendingOrderType == 'renew') {
    goHome()
    setTimeout(function () {
      renewActivity(pendingOrderInfo)
    }, 1000)
  }else if (pendingOrderType == 'order') {
    goHome()
  }

  for (let i = 0; i < orderInfo[1].length; i += 1) {
    await editProductInventory(orderInfo[1][i])
    await delay(1000)
  }

  recieptProcess(orderInfo, docRef.id)
}

async function createActivity(memberInfo){
  // [ 'zyTw1YM1bsk9dBigeZSy', 'Locker', '10', '', false, false ]
  // ['memberid', 'type', 'number', 'notes', waitlist, waiver?(false)]
  notificationSystem('warning', 'Renewing time...')
  let theUserID = getUID();
  let theCurrentTime = Math.floor(Date.now() / 1000);
  let theTimeExpire = theCurrentTime + 21600;
  const docRef = await addDoc(collection(db, "activity"), {
    active: true,
    goingInactive: false,
    waitlist: memberInfo[4],
    currIn: false,
    lockerRoomStatus: Array(
      true,
      memberInfo[2],
      memberInfo[1],
      theUserID,
      theCurrentTime,
      theTimeExpire
    ),
    memberID: memberInfo[0],
    notes: memberInfo[3],
    timeIn: serverTimestamp(),
    timeOut: null
  });
  notificationSystem('success', 'Customer checked in!')

  if (memberInfo[5]) {
    const memberRef = doc(db, "members", memberInfo[0]);
    await updateDoc(memberRef, {
      waiver_status: true
    });
  }
}

async function editActivity(activityInfo){
  const activityRef = doc(db, "activity", activityInfo[0]);
  await updateDoc(activityRef, {
    'lockerRoomStatus.0': activityInfo[4][0],
    'lockerRoomStatus.1': activityInfo[2],
    'lockerRoomStatus.2': activityInfo[1],
    'lockerRoomStatus.3': activityInfo[4][3],
    'lockerRoomStatus.4': activityInfo[4][4],
    'lockerRoomStatus.5': activityInfo[4][5],
    notes: activityInfo[3]
  });
  goHome()
}


async function changeInOut(activityInfo){
  const activityRef = doc(db, "activity", activityInfo[0]);
  await updateDoc(activityRef, {
    currIn: activityInfo[1]
  });
}

async function changeWaitlist(activityInfo){
  const activityRef = doc(db, "activity", activityInfo[0]);
  await updateDoc(activityRef, {
    waitlist: activityInfo[1]
  });
}

async function closeActivity(memberInfo) {
  const activityRef = doc(db, "activity", memberInfo);
  await updateDoc(activityRef, {
    timeOut: serverTimestamp(),
    goingInactive: true
  });
  setTimeout(async () => {
    const activityRef = doc(db, "activity", memberInfo);
    await updateDoc(activityRef, {
      active: false
    });
  }, 1000);
}

async function addLockerRoom(lockerRoomInfo){
  const activityRef = doc(db, "activity", lockerRoomInfo[0]);
  let userAdding = getUID();
  let theTimestamp = Math. round((new Date()). getTime() / 1000);
  let theTimestamp2 = Math. round((new Date()). getTime() / 1000); + 10000
  await updateDoc(activityRef, {
    lockerRoomStatus: Array(true, lockerRoomInfo[2], lockerRoomInfo[1], userAdding, theTimestamp, theTimestamp2)
  });
}

async function deleteMember(memberInfo){
  let theRank = await getRank()
  if (theRank == "1") {
    await deleteDoc(doc(db, "members", memberInfo));
  }else{
    console.log('No permissions!');
  }
}

async function removeCategory(categoryInfo){
  let userAllowed = canUser('permissionEditCategory')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  await deleteDoc(doc(db, "categories", categoryInfo));
}

async function removeProduct(productInfo){
  let userAllowed = canUser('permissionEditProducts')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  await deleteDoc(doc(db, "products", productInfo));
}

async function removeDiscount(discountInfo){
  let userAllowed = canUser('permissionEditDiscounts')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  await deleteDoc(doc(db, "discounts", discountInfo));
}

async function getActiveRegister(){
  const docRef = doc(db, "registers", regStatusID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  } else {
    return false;
  }
}

async function registerStatus(){
  let theUserID = getUID()
  const registerRef = collection(db, "registers");
  docRef = query(registerRef, where("active", "==", true), where("uid", "==", theUserID));
  const docSnap = await getDocs(docRef);

  regStatus = false
  regStatusID = false
  regStatusShift = false
  let userAllowed = canUser('permissionEditRegisters')
  let noAction = true

  docSnap.forEach((doc) => {
    if (doc.data()) {
      regStatus = true
      regStatusID = doc.id
      regStatusShift = doc.data().shift
      noAction = false
      theClient.send('register-status-change', Array(true, userAllowed, doc.data()))
    }else{
      regStatus = false
      regStatusID = false
      regStatusShift = false
      noAction = false
      theClient.send('register-status-change', Array(false, userAllowed, false))
    }
  })
  if (noAction) {
    theClient.send('register-status-change', Array(false, userAllowed, false))    
  }
}

async function gatherAllRegisters(){
  const q = query(collection(db, "registers"), where("active", "==", true), where('uid', '!=', getUID()));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(async (doc) => {
    theClient.send('register-all-request-return', Array(doc.id, doc.data()))    
  });
}

async function startRegister(registerInfo){
  registerStatus()
  if (regStatus) {
    return
  }

  if (registerInfo[1] == 'b') {
    const q = query(collection(db, "registers"), where("active", "==", true), where("shift", '!=', 'd'));
    let stillOpen = false
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      stillOpen = true
    });
    if (stillOpen) {
      notificationSystem('danger', 'Please ensure all registers are closed before opening a dayshift drawer.')
      return
    }else{
      startRegisterReportFinal()
    }

    getSystemData()
  }

  const docRef = await addDoc(collection(db, "registers"), {
    active: true,
    timestampStart: serverTimestamp(),
    uid: getUID(),
    uname: getDisplayName(),
    starting: Number(registerInfo[0]),
    shift: registerInfo[1],
    ending: false,
    drop: 0,
    ccard: 0,
    gcard: 0
  });

  goRegister()
}

async function manageEndRegister(registerInfo){
  let userAllowed = canUser('permissionEditRegisters')
  if (!userAllowed) {
    return
  }
  const registerRef = doc(db, "registers", registerInfo[0]);
  await updateDoc(registerRef, {
    timestampEnd: serverTimestamp(),
    ending: Number(registerInfo[1]),
    active: false
  });
  goRegister()
  startRegisterReport(registerInfo[0], false, false, registerInfo[2])
  registerStatus()
}

async function endRegister(registerInfo, logoutTF){
  if (!regStatus) {
    return
  }
  const registerRef = doc(db, "registers", regStatusID);
  await updateDoc(registerRef, {
    timestampEnd: serverTimestamp(),
    ending: Number(registerInfo[0]),
    ccard: Number(registerInfo[11]),
    input100: registerInfo[1],
    input50: registerInfo[2],
    input20: registerInfo[3],
    input10: registerInfo[4],
    input5: registerInfo[5],
    input1: registerInfo[6],
    input25c: registerInfo[7],
    input10c: registerInfo[8],
    input5c: registerInfo[9],
    input1c: registerInfo[10],
    active: false
  });
  startRegisterReport(regStatusID, false, false, false)
  regStatus = false
  regStatusID = false
  regStatusShift = false
  if (!logoutTF) {
    goRegister()
    registerStatus()
  }else{
    setTimeout(() => {
      userLogout()
    }, 2000);    
  }
}

async function updateRegisterSub(registerInfo, amount, total, drop) {
  let registerAmount = registerInfo.starting
  let gCardAmt = registerInfo.gcard
  gCardAmt = (gCardAmt + amount[1])

  registerAmount = registerAmount + amount[2]

  let dropAmt = registerInfo.drop

  let paymentTotal = 0;
  if (!drop) {
    paymentTotal = paymentTotal + amount[0]
    paymentTotal = paymentTotal + amount[1]
    paymentTotal = paymentTotal + amount[2]

    if (paymentTotal > total[2]) {
      totalSub = (total[2] - paymentTotal)
      if (totalSub < 0) {
        registerAmount = registerAmount + totalSub
      }
    }    
  }else{
    dropAmt = (dropAmt + Math.abs(amount[2]))
  }
  const registerRef = doc(db, "registers", regStatusID);
  await updateDoc(registerRef, {
    starting: Number(registerAmount),
    gcard: Number(gCardAmt),
    drop: Number(dropAmt)
  });      
}

async function registerReportTest(){
  // Create a new instance of a Workbook class
  var wb = new xl.Workbook();

  // Add Worksheets to the workbook
  var ws = wb.addWorksheet('Detail');
  var ws2 = wb.addWorksheet('Summary');

  // Create a reusable style
  var redStyle = wb.createStyle({
    font: {
      color: '#FF0800',
      size: 12,
    },
    numberFormat: '$#,##0.00; ($#,##0.00); -',
  });

  var boldStyle = wb.createStyle({
    font: {
      bold: true,
      size: 12
    }
  })

  var moneyStyle = wb.createStyle({
    numberFormat: '$#,##0.00; ($#,##0.00); -',
  });

  wb.write(systemData.fileSaveSystemDir + '/test-report.xlsx')
}


async function startRegisterReport(registerID, timeframe, isFinal, cid){
  getSystemData()
  let registerInfo;
  let startDateStr
  let reportType = ""
  let theCID = getUID()
  if (cid) {
    theCID = cid
  }

  const toDate = new Date();
  let day = toDate.getDate();
  let month = toDate.getMonth() + 1;
  let year = toDate.getFullYear();
  let hour = toDate.getHours();
  let min = toDate.getMinutes();
  let sec = toDate.getSeconds();
  let ampm = hour >= 12 ? 'pm' : 'am';

  if (day < 10) {
    day = '0' + day
  }

  if (month < 10) {
    month = '0' + month
  }

  if (min < 10) {
    min = '0' + min
  }

  if (sec < 10) {
    sec = '0' + sec
  }

  let currentDate = `${month}/${day}/${year}`;
  let currentDateFile = `${month}-${day}-${year}`;
  let currentTime = `${hour}:${min}:${sec} ${ampm}`;
  let currentTimeFile = `${hour}-${min}-${sec}-${ampm}`;

  currentDateStr = currentDate + ' ' + currentTime

  const ordersRef = collection(db, "orders");
  if (registerID) {
    reportType = 'Regiser'
    const docRef = doc(db, "registers", registerID);
    const docSnap = await getDoc(docRef);
    registerInfo = docSnap.data()    
    q1 = query(ordersRef, where("timestamp", ">", registerInfo.timestampStart), where("timestamp", "<", registerInfo.timestampEnd), where("cashier", "==", theCID));
   
    const startDate = new Date(registerInfo.timestampStart['seconds'] * 1000);
    let day = startDate.getDate();
    let month = startDate.getMonth() + 1;
    let year = startDate.getFullYear();
    let hour = startDate.getHours();
    let min = startDate.getMinutes();
    let sec = startDate.getSeconds();
    let ampm = hour >= 12 ? 'pm' : 'am';

    if (day < 10) {
      day = '0' + day
    }

    if (month < 10) {
      month = '0' + month
    }

    if (min < 10) {
      min = '0' + min
    }

    if (sec < 10) {
      sec = '0' + sec
    }

    let startDateS = `${month}/${day}/${year}`;
    let startTime = `${hour}:${min}:${sec} ${ampm}`;

    startDateStr = startDateS + ' ' + startTime

  }

  if (timeframe) {
    reportType = 'Generated'

    const dates = new Date(currentDate + ' 07:00');
    let day = dates.getDate();
    let month = dates.getMonth() + 1;
    let year = dates.getFullYear();
    let hour = dates.getHours();
    let min = dates.getMinutes();
    let sec = dates.getSeconds();
    let ampm = hour >= 12 ? 'pm' : 'am';

    if (day < 10) {
      day = '0' + day
    }

    if (month < 10) {
      month = '0' + month
    }

    if (min < 10) {
      min = '0' + min
    }

    if (sec < 10) {
      sec = '0' + sec
    }

    let startDateS = `${month}/${day}/${year}`;
    let startTime = `${hour}:${min}:${sec} ${ampm}`;

    startDateStr = startDateS + ' ' + startTime
    q1 = query(ordersRef, where("timestamp", ">", dates));
  }

  if (isFinal) {
    reportType = 'Final'
    const startDateFinal = new Date(isFinal * 1000);
    let day = startDateFinal.getDate();
    let month = startDateFinal.getMonth() + 1;
    let year = startDateFinal.getFullYear();
    let hour = startDateFinal.getHours();
    let min = startDateFinal.getMinutes();
    let sec = startDateFinal.getSeconds();
    let ampm = hour >= 12 ? 'pm' : 'am';

    if (day < 10) {
      day = '0' + day
    }

    if (month < 10) {
      month = '0' + month
    }

    if (min < 10) {
      min = '0' + min
    }

    if (sec < 10) {
      sec = '0' + sec
    }

    startDateS = `${month}/${day}/${year}`;
    startTime = `${hour}:${min}:${sec} ${ampm}`;

    startDateStr = startDateS + ' ' + startTime
    q1 = query(ordersRef, where("timestamp", ">", startDateFinal));    
  }

  let productsAndAmounts = Array()
  let discountsAndAmounts = Array()
  productsData.forEach((product, i) => {
    productsAndAmounts.push(Array(product[0], 0))
  });
  discountsData.forEach((discount, i) => {
    discountsAndAmounts.push(Array(discount[0], 0))
  });

  let totalMoney = 0;
  let totalTax = 0;
  let totalNet = 0;
  let totalCash = 0;
  let totalCCard = 0;
  let totalGCard = 0;

  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    let orderInfo = doc.data()
    orderInfo.products.forEach((products, i) => {
      productsAndAmounts.forEach((productsAA, i2) => {
        if (productsAA[0] == products) {
          productsAA[1] = productsAA[1] + 1
        }
      })
    })
    if (orderInfo.discounts) {
      orderInfo.discounts.forEach((discount, i) => {
        discountsAndAmounts.forEach((discountAA, i2) => {
          if (discountAA[0] == discount) {
            discountAA[1] = discountAA[1] + 1
          }
        })
      })      
    }
    totalMoney = totalMoney + orderInfo.total[0]
    totalTax = totalTax + orderInfo.total[1]
    totalCCard = totalCCard + orderInfo.paymentMethod[0]
    totalGCard = totalGCard + orderInfo.paymentMethod[1]
    if (orderInfo.paymentMethod[3] < 0) {
      totalCash = totalCash + (orderInfo.paymentMethod[2] + orderInfo.paymentMethod[3])
    }else{
      totalCash = totalCash + orderInfo.paymentMethod[2]
    }

  })
 
  totalNet = totalMoney + totalTax

  // https://www.npmjs.com/package/excel4node

  // Create a new instance of a Workbook class
  var wb = new xl.Workbook();

  // Add Worksheets to the workbook
  var ws = wb.addWorksheet('Detail');
  var ws2 = wb.addWorksheet('Summary');

  // Create a reusable style
  var redStyle = wb.createStyle({
    font: {
      color: '#FF0800',
      size: 12,
    },
    numberFormat: '$#,##0.00; ($#,##0.00); -',
  });

  var boldStyle = wb.createStyle({
    font: {
      bold: true,
      size: 12
    }
  })

  var moneyStyle = wb.createStyle({
    numberFormat: '$#,##0.00; ($#,##0.00); -',
  });

  //      (Y, X)  
  ws.cell(1, 1)
    .string('CERMS')
    .style(boldStyle)
    .style({ font: { size: 20 } });

  ws.cell(1, 4)
    .string('Report Start Time: ')

  ws.cell(1, 6)
    .string(startDateStr)

  ws.cell(2, 4)
    .string('Report End Time: ')

  ws.cell(2, 6)
    .string(currentDateStr)

  ws.cell(3, 4)
    .string('Cashier: ')

  let cashName = 'No Cashier Assigned (Full Report)'
  if (registerID) {
    cashName = registerInfo.uname
  }

  ws.cell(3, 6)
    .string(cashName)

  ws.cell(2, 1)
    .string('Deposit Detail Worksheet')

  ws.cell(3, 1)
    .string('2.0')

  ws.cell(4, 1)
    .string('Totals:')

  ws.cell(4, 3)
    .number(totalMoney)
    .style(moneyStyle)

  ws.cell(7, 2)
    .string('TAX')
    .style(boldStyle)

  ws.cell(7, 3)
    .number(totalTax)
    .style(moneyStyle)

  ws.cell(8, 2)
    .string('NET')
    .style(boldStyle);

  ws.cell(8, 3)
    .number(totalNet)
    .style(moneyStyle);

  ws.cell(10, 2)
    .string('CASH')
    .style(boldStyle);

  ws.cell(10, 3)
    .number(totalCash)
    .style(moneyStyle);

  ws.cell(11, 2)
    .string('CCARD')
    .style(boldStyle);

  ws.cell(11, 3)
    .number(totalCCard)
    .style(moneyStyle);

  ws.cell(12, 2)
    .string('GCARD')
    .style(boldStyle);

  ws.cell(12, 3)
    .number(totalGCard)
    .style(moneyStyle);

  if (!isFinal) {
    ws.cell(13, 1)
      .string('Cash')
    ws.cell(13, 2)
      .string('Over/Short')
    ws.cell(14, 1)
      .string('CCard')
    ws.cell(14, 2)
      .string('Over/Short')

    let registerDiff = 0;
    let registerDiff2 = 0;

    if (registerID) {
      registerDiff = (registerInfo.ending - registerInfo.starting)
      registerDiff2 = (registerInfo.ccard - totalCCard)
    }
    let osTxt = ''
    let osTxt2 = ''
    if (registerDiff > 0) {
      osTxt = 'Over'
    } else if (registerDiff < 0) {
      osTxt = 'Short'
    } else {
      osTxt = ''
    }
    if (registerDiff2 > 0) {
      osTxt2 = 'Over'
    } else if (registerDiff2 < 0) {
      osTxt2 = 'Short'
    } else {
      osTxt2 = ''
    }

    ws.cell(13, 3)
      .string(osTxt)
    ws.cell(14, 3)
      .string(osTxt2)

    ws2.cell(10, 8)
      .string(osTxt)

    ws2.cell(10, 10)
      .string(osTxt2)

    if (registerDiff != 0) {
      ws.cell(13, 4)
        .number(registerDiff)
        .style(moneyStyle);
    }

    if (registerDiff2 != 0) {
      ws.cell(14, 4)
        .number(registerDiff2)
        .style(moneyStyle);

      ws2.cell(14, 10)
        .number(registerDiff2)
        .style(moneyStyle);
    }

    ws2.cell(14, 8)
      .number(registerDiff)
      .style(moneyStyle);

    ws.cell(13, 6)
      .string('Money Drop: ')

    if (registerInfo) {
      ws.cell(13, 7)
        .number(registerInfo.drop)
        .style(moneyStyle)      
    }else{
      ws.cell(13, 7)
        .number(0)
        .style(moneyStyle)      
    }
  }

  ws.cell(16, 1)
    .string('Products:')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(16, 2)
    .string('Description')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(16, 3)
    .string('#')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(16, 4)
    .string('$')
    .style(boldStyle)
    .style({ font: { underline: true } });

  let productDescLine = 18;
  let productNames = Array()
  productsData.forEach((product, i) => {
    productNames.push(product[1].name)
    ws.cell(productDescLine, 2)
    .string(product[1].name);
    productsAndAmounts.forEach((productsAA, i2) => {
      if (productsAA[0] == product[0]) {
        ws.cell(productDescLine, 3)
        .number(productsAA[1]);

        ws.cell(productDescLine, 4)
        .number(product[1].price * productsAA[1])
        .style(moneyStyle);
      }
    })
    productDescLine = productDescLine + 1
  });
  productDescLine = productDescLine + 1

  const lengthArr = productNames.map(productNames => productNames.length)
  const maxWidth = Math.max(...lengthArr)
  ws.column(2).setWidth(maxWidth)

  ws.cell(productDescLine, 1)
    .string('Advertisment Sales:')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(productDescLine, 2)
    .string('Description')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(productDescLine, 3)
    .string('#')
    .style(boldStyle)
    .style({ font: { underline: true } });

  ws.cell(productDescLine, 4)
    .string('$')
    .style(boldStyle)
    .style({ font: { underline: true } });

  productDescLine = productDescLine + 2
  
  discountsData.forEach((discount, i) => {
    if (discount[1].asCheck) {
      ws.cell(productDescLine, 2)
        .string(discount[1].code);
      discountsAndAmounts.forEach((discountAA, i2) => {
        if (discountAA[0] == discount[0]) {
          ws.cell(productDescLine, 3)
            .number(discountAA[1]);
        }
      })
      productDescLine = productDescLine + 1      
    }
  });
  productDescLine = productDescLine + 1


  // Set value of cell C1 to a formula styled with paramaters of style
//  ws.cell(1, 3)
 //   .formula('A1 + B1')
  //  .style(style);

  // Set value of cell A2 to 'string' styled with paramaters of style
//  ws.cell(2, 1)
 //   .string('string')
  //  .style(style);

  // Set value of cell A3 to true as a boolean type styled with paramaters of style but with an adjustment to the font size.
//  ws.cell(3, 1)
  //  .bool(true)
   // .style(style)
    //.style({ font: { size: 14 } });


// 2nd page

  //       U/D   L/R
  //      (Y, X)  
  ws2.cell(1, 1)
    .string('CERMS')
    .style(boldStyle)
    .style({ font: { size: 20 } });

  ws2.cell(1, 4)
    .style(boldStyle)
    .string('Deposit Journal Worksheet')

  ws2.cell(1, 6)
    .style(boldStyle)
    .string('Deposit Date:')

  ws2.cell(1, 7)
    .string(startDateStr)

  ws2.cell(1, 8)
    .style(boldStyle)
    .string('Cashier:')

  ws2.cell(1, 9)
    .string(cashName)

  ws2.cell(1, 11)
    .string('2.0')

  ws2.cell(2, 1)
    .style(boldStyle)
    .string('Biz Date')

  ws2.cell(2, 2)
    .style(boldStyle)
    .string('Shift')

  ws2.cell(2, 3)
    .style(boldStyle)
    .string('Memberships')

  ws2.cell(2, 4)
    .style(boldStyle)
    .string('Rentals')

  ws2.cell(2, 6)
    .style(boldStyle)
    .string('CounterTx')

  ws2.cell(2, 7)
    .style(boldStyle)
    .string('Sales Tax')

  ws2.cell(2, 8)
    .style(boldStyle)
    .string('NoTxCounter')

  ws2.cell(2, 9)
    .style(boldStyle)
    .string('Pass-Thru')

  ws2.cell(2, 10)
    .style(boldStyle)
    .string('Shift Gross')

  ws2.cell(2, 11)
    .style(boldStyle)
    .string("Day's Gross")

  ws2.cell(2, 12)
    .style(boldStyle)
    .string("Advert. Sales")

  ws2.cell(3, 1)
    .string(startDateStr)

  let membershipsAmt = 0
  let rentalsAmt = 0
  let counterTxAmt = 0
  let salesTaxAmt = 0
  let noCounterTxAmt = 0
  let passThruAmt = 0
  let grossShiftAmt = 0
  let grossDayAmt = 0
  let advertSaleAmt = 0
  productsData.forEach((product, i) => {
    productsAndAmounts.forEach((productsAA, i2) => {
      if (productsAA[0] == product[0]) {
        if (product[1].membership) {
          membershipsAmt = membershipsAmt + (product[1].price * productsAA[1])
        } else if (product[1].rental) {
          rentalsAmt = rentalsAmt + (product[1].price * productsAA[1])
        } else {
          if (product[1].taxable) {
            let proPrice = Number(product[1].price)
            let proTax = Number(.07)
            let proMulti = Number(productsAA[1])
            counterTxAmt = counterTxAmt + (proPrice + (proPrice * proTax)) * proMulti
            salesTaxAmt = salesTaxAmt + ((proPrice * proTax) * proMulti)
          }else{
            noCounterTxAmt = noCounterTxAmt + (product[1].price * productsAA[1])
          }
        }
      }
    })
  }); 

  //
  ws2.cell(3, 3)
    .number(membershipsAmt)
    .style(moneyStyle);

  ws2.cell(3, 4)
    .number(rentalsAmt)
    .style(moneyStyle);

  ws2.cell(3, 6)
    .number(counterTxAmt)
    .style(moneyStyle);

  ws2.cell(3, 7)
    .number(salesTaxAmt)
    .style(moneyStyle);

  ws2.cell(3, 8)
    .number(noCounterTxAmt)
    .style(moneyStyle);

  ws2.cell(3, 9)
    .number(passThruAmt)
    .style(moneyStyle);

  ws2.cell(3, 10)
    .number(totalNet)
    .style(moneyStyle);
  
  ws2.cell(3, 11)
    .number(grossDayAmt)
    .style(moneyStyle);
  
  ws2.cell(3, 12)
    .string("N/A")
    .style(moneyStyle);
  
    ws2.cell(7, 2)
    .style(boldStyle)
    .string('Totals:')

  ws2.cell(7, 3)
    .number(membershipsAmt)
    .style(moneyStyle);

  ws2.cell(7, 4)
    .number(rentalsAmt)
    .style(moneyStyle);
    
  ws2.cell(7, 6)
    .number(counterTxAmt)
    .style(moneyStyle);

  ws2.cell(7, 7)
    .number(salesTaxAmt)
    .style(moneyStyle);

  ws2.cell(7, 8)
    .number(noCounterTxAmt)
    .style(moneyStyle);

  ws2.cell(7, 9)
    .number(passThruAmt)
    .style(moneyStyle);

  ws2.cell(7, 10)
    .number(grossShiftAmt)
    .style(moneyStyle);

  ws2.cell(7, 11)
    .number(grossDayAmt)
    .style(moneyStyle);

  ws2.cell(9, 1)
    .style(boldStyle)
    .string('Biz Date')

  ws2.cell(9, 2)
    .style(boldStyle)
    .string('Shift')

  ws2.cell(9, 3)
    .style(boldStyle)
    .string('Detail CCard')

  ws2.cell(9, 4)
    .style(boldStyle)
    .string('Detail Gift Card')

  ws2.cell(9, 5)
    .style(boldStyle)
    .string('Detail Cash')

  ws2.cell(9, 6)
    .style(boldStyle)
    .string('Detail Net')

  ws2.cell(9, 7)
    .style(boldStyle)
    .string('Actual Cash')

  ws2.cell(9, 8)
    .style(boldStyle)
    .string('Over/(Short)')

  ws2.cell(9, 9)
    .style(boldStyle)
    .string('Actual Charge')

  ws2.cell(9, 10)
    .style(boldStyle)
    .string('Over/(Short)')

  ws2.cell(10, 1)
    .string(startDateStr)

  ws2.cell(10, 2)
    .string('')

  //

  ws2.cell(10, 6)
    .string('NET')


  if (registerInfo) {
    ws2.cell(10, 3)
      .number(registerInfo.ccard)
      .style(moneyStyle);

    ws2.cell(10, 4)
      .number(registerInfo.gcard)
      .style(moneyStyle);

    ws2.cell(10, 5)
      .number(totalCash)
      .style(moneyStyle);

    ws2.cell(10, 7)
      .number(totalCash)
      .style(moneyStyle);

    ws2.cell(10, 9)
      .number(registerInfo.ccard)
      .style(moneyStyle);

    ws2.cell(14, 3)
      .number(registerInfo.ccard)
      .style(moneyStyle);

    ws2.cell(14, 4)
      .number(registerInfo.gcard)
      .style(moneyStyle);

    ws2.cell(14, 5)
      .number(registerInfo.ending)
      .style(moneyStyle);

    ws2.cell(14, 6)
      .number(registerInfo.ccard + registerInfo.gcard + registerInfo.ending)
      .style(moneyStyle);

    ws2.cell(14, 7)
      .number(registerInfo.ending)
      .style(moneyStyle);
  }

  ws2.cell(14, 2)
    .style(boldStyle)
    .string('Totals:')

  wb.write(systemData.fileSaveSystemDir + '/' + currentDateFile + '-' + currentTimeFile + '-' + reportType + '.xlsx')
}

async function startRegisterReportFinal(){
  startRegisterReport(false, true, systemData.registerStart['seconds'], false)
  const systemRef = doc(db, "system", "system");
  await updateDoc(systemRef, {
    registerStart: serverTimestamp(),
  });
}

async function editMembership(memberInfo){
  notificationSystem('warning', 'Updating member...')
  const dateStr = memberInfo[5];
  const date = new Date(dateStr);
  const timestampInMs = date.getTime();
  const unixTimestamp = Math.floor(date.getTime() / 1000);
  const docRef = doc(db, "members", memberInfo[0]);

  await updateDoc(docRef, {
    fname: memberInfo[1],
    lname: memberInfo[2],
    dob: memberInfo[3],
    membership_type: memberInfo[4],
    id_expiration: unixTimestamp,
    idnum: memberInfo[6],
    idstate: memberInfo[7],
    notes: memberInfo[8],
    waiver_status: memberInfo[9],
    name: memberInfo[1] + ' ' + memberInfo[2],
    email: memberInfo[10]
  });
  notificationSystem('success', 'Member updated!')
}

async function editCategory(categoryInfo){
  notificationSystem('warning', 'Editing category...')
  let userAllowed = canUser('permissionEditCategory')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  const docRef = doc(db, "categories", categoryInfo[0]);

  await updateDoc(docRef, {
    name: categoryInfo[1],
    desc: categoryInfo[2],
    color: categoryInfo[3],
  });
  notificationSystem('success', 'Category edited!')
}

async function productIsCore(productID){
  const docRef = doc(db, "products", productID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data().core;
  } else {
    return false;
  }
}

async function getProductInfo(productID){
  const docRef = doc(db, "products", productID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  } else {
    return false;
  }
}

async function getDiscountInfo(discountID){
  const docRef = doc(db, "discounts", discountID);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  } else {
    return false;
  }
}

async function editProduct(productInfo){
  notificationSystem('warning', 'Editing Product...')
  let userAllowed = canUser('permissionEditProducts')
  let isProductCore = await productIsCore(productInfo[0])
  let userAllowedCore = canUser('permissionEditCoreProducts')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  if (!userAllowedCore && isProductCore) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  if (!userAllowedCore && productInfo[9]) {
    notificationSystem('danger', 'No permissions...')
    return    
  }

//  11 - editProductMembership.checked, 
//  12 - editProductMembershipLength.value, 
//  13 - editProductMembershipLengthType.value

  let theMembershipLength = false
  if (productInfo[11]) {
    let theMultiple
    if (productInfo[13] == 'hour') {
      theMultiple = 3600
    } else if (productInfo[13] == 'day') {
      theMultiple = 86400
    } else if (productInfo[13] == 'week') {
      theMultiple = 604800
    } else if (productInfo[13] == 'month') {
      theMultiple = 2.628e+6
    } else if (productInfo[13] == 'year') {
      theMultiple = 3.154e+7
    }
    theMembershipLength = productInfo[12] * theMultiple
  }

  const docRef = doc(db, "products", productInfo[0]);
  await updateDoc(docRef, {
    cat: productInfo[1],
    name: productInfo[2],
    price: productInfo[3],
    invWarning: productInfo[4],
    desc: productInfo[5],
    inventory: productInfo[6],
    inventoryPar: productInfo[14],
    taxable: productInfo[7],
    active: productInfo[8],
    core: productInfo[9],
    rental: productInfo[10],
    membership: productInfo[11],
    membershipLength: theMembershipLength,
    membershipLengthRaw: productInfo[12],
    membershipLengthType: productInfo[13],
    barcode: productInfo[15]
  });
  notificationSystem('success', 'Product Edited!')
  goProducts()
}

async function editProductInventory(productInfo) {
  let currInv = false;
  const docRef = doc(db, "products", productInfo);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    currInv = docSnap.data().inventory
  }

  if (currInv > 0) {
    currInv = currInv - 1
    let isActive = true
    if (currInv <= 0) {
      isActive = false
    }
    const docRef = doc(db, "products", productInfo);

    await updateDoc(docRef, {
      inventory: currInv,
      active: isActive
    });
    if (currInv <= docSnap.data().invWarning) {
      let theMsg = "Be advised... You are recieving this alert because the product '" + docSnap.data().name + "' is running low. Inventory is currently " + currInv;
      createMail(systemData.invWarnEMail, "Inventory Warning", theMsg, theMsg)
    }
    return true
  }else{
    return false
  }
}

async function editDiscount(discountInfo){
  console.log(discountInfo);
  notificationSystem('warning', 'Editing Discount...')
  let userAllowed = canUser('permissionEditDiscounts')
  if (!userAllowed) {
    notificationSystem('danger', 'No permissions...')
    return
  }
  const docRef = doc(db, "discounts", discountInfo[0]);
  let d = new Date(discountInfo[5]).getTime();
  await updateDoc(docRef, {
    code: discountInfo[1],
    dollar: discountInfo[2],
    percent: discountInfo[3],
    amount: discountInfo[4],
    asCheck: discountInfo[5],
    asPro: discountInfo[6],
    expires: d,
    typeProduct: discountInfo[7],
    typeOrder: discountInfo[8],
    limit: Number(discountInfo[10]),
    used: Number(discountInfo[11])
  });
  notificationSystem('success', 'Discount Edited!')
  goProducts()
}

async function updateTLID(){
  const q1 = query(collection(db, "members"), where("id_number", "==", systemData.lid + 1));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    updateLID()
    getSystemData();
    update = true;
    updateTLID()
  });
}

async function createMembership(memberInfo){
  theClient.send('membership-pending')
  notificationSystem('warning', "Creating member...")
  let update = false;
  let idExpiration;
  let theCurrentTime = Math.floor(Date.now() / 1000);

  let theProductInfo
  productsData.forEach(product => {
    if (product[1].name == memberInfo[3]) {
      theProductInfo = product
    }
  });

  idExpiration = theCurrentTime + theProductInfo[1].membershipLength

  const q1 = query(collection(db, "members"), where("id_number", "==", systemData.lid + 1));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    theClient.send('membership-pending-waiting-for-id')
    notificationSystem('warning', 'Creating member... (waiting for new ID)')
    updateLID()
    getSystemData();
    update = true;
    setTimeout(function(){createMembership(memberInfo)}, 3000);
  });
  if (!update){
    const q2 = query(collection(db, "members"), where("name", "==", memberInfo[0] + " " + memberInfo[1]), where("dob", "==", memberInfo[2]), where('idnum', "==", memberInfo[6]));
    const querySnapshot2 = await getDocs(q2);
    querySnapshot2.forEach( async (doc) => {
      updateMembership(doc.id, doc.data(), memberInfo);
      updateOrderCustomerID(pendingOrderID, doc.id)
      update = true;
    });
  }
  if (!update) {
    const docRef = await addDoc(collection(db, "members"), {
      notes: memberInfo[4],
      name: memberInfo[0] + " " + memberInfo[1],
      fname: memberInfo[0],
      lname: memberInfo[1],
      dna: false,
      id_number: systemData.lid + 1,
      waiver_status: memberInfo[5],
      id_expiration: idExpiration,
      dob: memberInfo[2],
      creation_time: serverTimestamp(),
      membership_type: memberInfo[3],
      checkedIn: false,
      idnum: memberInfo[6],
      idstate: memberInfo[7],
      email: memberInfo[8]
    });
    theClient.send('membership-success', docRef.id)
    let theID = 'Unknown ID'
    if (docRef.id) {
      theID = "<a id='" + docRef.id + "' href='#'>" + docRef.id + "</a>"
    }
    let theMsg = "Membership created! ID: " + theID
    notificationSystem('success', theMsg)
//    let theMembersData = await getMemberInfo(docRef.id);
//    theClient.send('membership-request-return', Array(docRef.id, theMembersData))
    updateOrderCustomerID(pendingOrderID, docRef.id)
    updateLID();
    lastMemberCreated = docRef.id
  }
}

async function gatherUserByID(theUserID){
  const querySnapshot = await getDocs(collection(db, "users"));
  querySnapshot.forEach((doc) => {
    if (doc.id == theUserID) {
      return doc.data()
    }
  });
}

async function gatherAllUsers(){
  const querySnapshot = await getDocs(collection(db, "users"));
  querySnapshot.forEach((doc) => {
    theClient.send('recieve-users', Array(doc.id, doc.data()))
  });
}

async function gatherMemberHistory(memberID){
  const q1 = query(collection(db, "activity"), where("memberID", "==", memberID));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    theClient.send('member-history-request-return', Array(doc.id, doc.data()))
  });
}

async function gatherOrderHistory(memberID){
  const q1 = query(collection(db, "orders"), where("customerID", "==", memberID));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    theClient.send('member-order-history-request-return', Array(doc.id, doc.data()))
  });
}

async function startGatherAllMembers(){
  if (startGatherAllMembersA) {
    return
  }
  startGatherAllMembersA = true;

  const q = query(collection(db, "members"), orderBy("creation_time"));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        if (!members.includes(change.doc.id)) {
          members.push(change.doc.id);
          membersData.push(Array(change.doc.id, change.doc.data()));
          theClient.send('membership-request-return', Array(change.doc.id, change.doc.data()))
        }
      }
      if (change.type === "modified") {
        if (members.includes(change.doc.id)) {
          membersData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              theClient.send('membership-request-return-update', Array(change.doc.id, change.doc.data()))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (members.includes(change.doc.id)) {
          membersData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              membersData.splice(i,1)
              theClient.send('membership-request-return-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function displayAllMembers(){
  let membersDataBrokenDown = membersData.slice(Math.max(membersData.length - 10, 0))
  membersDataBrokenDown.forEach((member) => {
    theClient.send('membership-request-return', Array(member[0], member[1]))
  })
}

async function displayAllDNAMembers(){
  membersData.forEach((member) => {
    if (member[1].dna) {
      theClient.send('membership-request-return', Array(member[0], member[1]))      
    }
  })
}

async function displayAllCategories(){
  categoriesData.forEach((category) => {
    theClient.send('return-categories', Array(category[0], category[1]))
  })
}

async function displayAllProductsOrder(){
  theClient.send('return-category-order-all', Array(categoriesData))
  productsData.forEach((products) => {
    theClient.send('return-products-order', Array(products[0], products[1]))
  })
  theClient.send('return-products-order-all', Array(productsData, discountsData))
}

async function displayAllProducts(){
  productsData.forEach((products) => {
    let addedToMix = false;
    let catInfo = products[1].cat;
    let catData;
    categoriesData.forEach( async (item, i) => {
      if (item[0] == catInfo) {
        catData = item[1];
        theClient.send('return-products', Array(products[0], products[1], catData))
        addedToMix = true
      }
    });
    if (!addedToMix) {
      theClient.send('return-products', Array(products[0], products[1]))      
    }
  })
}

async function displayAllDiscounts(){
  discountsData.forEach((discount) => {
    theClient.send('return-discounts', Array(discount[0], discount[1]))
  })
}

async function displayAllHistory(){  
  let theCurrentTime = Math.floor(Date.now() / 1000);
  let theCurrentTimeP24 = theCurrentTime - 604800
  let theCurrentTimeP24Date = new Date(theCurrentTimeP24 * 1000);
  const q = query(collection(db, "activity"), where("active", "==", false), where("timeOut", ">=", theCurrentTimeP24Date));

  const querySnapshot = await getDocs(q);
  querySnapshot.forEach( async (doc) => {
    let theMemberInfo = await getMemberInfo(doc.data().memberID);
    theClient.send('history-request-return', Array(doc.id, doc.data(), theMemberInfo))
  });
}

async function displayAllOrders(){
  let theCurrentTime = Math.floor(Date.now() / 1000);
  let theCurrentTimeP24 = theCurrentTime - 604800
  let theCurrentTimeP24Date = new Date(theCurrentTimeP24 * 1000);
  const q = query(collection(db, "orders"), where("timestamp", ">=", theCurrentTimeP24Date));

  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(async (doc) => {
    let theMemberInfo = false
    if (doc.data().customerID) {
      theMemberInfo = await getMemberInfo(doc.data().customerID);
    }
    theClient.send('history-order-request-return', Array(doc.id, doc.data(), theMemberInfo))
  });
}

async function startGatherAllActivity(){
  if (startGatherAllActivityA) {
    return
  }
  startGatherAllActivityA = true;
  const q = query(collection(db, "activity"), where("active", "==", true));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!activitys.includes(change.doc.id)) {
          let theMemberInfo = await getMemberInfo(change.doc.data().memberID);
          activitys.push(change.doc.id);
          activitysData.push(Array(change.doc.id, change.doc.data(), theMemberInfo, change.doc.data().memberID));
          theClient.send('activity-request-return', Array(change.doc.id, change.doc.data(), theMemberInfo, change.doc.data().memberID))
        }
      }
      if (change.type === "modified") {
        if (activitys.includes(change.doc.id)) {
          activitysData.forEach( async (item, i) => {
            if (item[0] == change.doc.id) {
              let theMemberInfo = await getMemberInfo(change.doc.data().memberID);
              item[1] = change.doc.data();
              theClient.send('activity-request-return-update', Array(change.doc.id, change.doc.data(), theMemberInfo, change.doc.data().memberID))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (activitys.includes(change.doc.id)) {
          activitysData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              activitysData.splice(i,1)
              theClient.send('activity-request-return-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function startGatherAllCategories(){
  if (startGatherAllCategoryA) {
    return
  }
  startGatherAllCategoryA = true;
  const q = query(collection(db, "categories"));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!categories.includes(change.doc.id)) {
          categories.push(change.doc.id);
          categoriesData.push(Array(change.doc.id, change.doc.data()));
          theClient.send('return-categories', Array(change.doc.id, change.doc.data()))
        }
      }
      if (change.type === "modified") {
        if (categories.includes(change.doc.id)) {
          categoriesData.forEach( async (item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              theClient.send('return-categories-update', Array(change.doc.id, change.doc.data()))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (categories.includes(change.doc.id)) {
          categoriesData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              categoriesData.splice(i,1)
              theClient.send('return-categories-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function startGatherAllProducts(){
  if (startGatherAllProductsA) {
    return
  }
  startGatherAllProductsA = true;
  const q = query(collection(db, "products"), orderBy('name', 'asc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!products.includes(change.doc.id)) {
          products.push(change.doc.id);
          let catInfo = change.doc.data()['cat'];
          let catData;
          categoriesData.forEach( async (item, i) => {
            if (item[0] == catInfo) {
              catData = item[1];
            }
          });
          productsData.push(Array(change.doc.id, change.doc.data(), catData));
          theClient.send('return-products', Array(change.doc.id, change.doc.data()))
        }
      }
      if (change.type === "modified") {
        if (products.includes(change.doc.id)) {
          productsData.forEach( async (item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              let catInfo = change.doc.data()['cat'];
              let catData;
              categoriesData.forEach( async (item2, i2) => {
                if (item2[0] == catInfo) {
                  catData = item2[1];
                }
              });
              theClient.send('return-products-update', Array(change.doc.id, change.doc.data(), catData))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (products.includes(change.doc.id)) {
          productsData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              productsData.splice(i,1)
              theClient.send('return-products-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function startGatherAllDiscounts(){
  if (startGatherAllDiscountsA) {
    return
  }
  startGatherAllDiscountsA = true;
  const q = query(collection(db, "discounts"));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!discounts.includes(change.doc.id)) {
          discounts.push(change.doc.id);
          discountsData.push(Array(change.doc.id, change.doc.data()));
          theClient.send('return-discounts', Array(change.doc.id, change.doc.data()))
        }
      }
      if (change.type === "modified") {
        if (discounts.includes(change.doc.id)) {
          discountsData.forEach( async (item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              theClient.send('return-discounts-update', Array(change.doc.id, change.doc.data()))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (discounts.includes(change.doc.id)) {
          discountsData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              discountsData.splice(i,1)
              theClient.send('return-discounts-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function startGatherAllOrders(){
  if (startGatherAllOrdersA) {
    return
  }
  startGatherAllOrdersA = true;
  const q = query(collection(db, "orders"));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!orders.includes(change.doc.id)) {
          orders.push(change.doc.id);
          ordersData.push(Array(change.doc.id, change.doc.data()));
          theClient.send('return-orders', Array(change.doc.id, change.doc.data()))
        }
      }
      if (change.type === "modified") {
        if (orders.includes(change.doc.id)) {
          ordersData.forEach( async (item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              theClient.send('return-orders-update', Array(change.doc.id, change.doc.data()))
            }
          });
        }
      }
      if (change.type === "removed") {
        if (orders.includes(change.doc.id)) {
          ordersData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              ordersData.splice(i,1)
              theClient.send('return-orders-remove', Array(change.doc.id))
            }
          });
        }
      }
    });
  });
}

async function displayAllActivity(){
  activitysData.forEach((activity) => {
    theClient.send('activity-request-return', Array(activity[0], activity[1], activity[2], activity[3]))
  })
}

function attemptLogin(details){
  loginCreds = details;
  signInWithEmailAndPassword(auth, details[0], details[1])
  .then(async(userCredential) => {
    mainWin.loadFile(path.join(__dirname, 'index.html'));
    user = userCredential.user;
    setTimeout(function() {startLoading()}, 1000);
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    console.log(error);
    notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
  });
}

function createAccount(accountInfo){
  createUserWithEmailAndPassword(auth, accountInfo[0], "P@SSW0RD")
    .then((userCredential) => {
      let newUser = userCredential.user;
      updateProfile(newUser, {
        displayName: accountInfo[1]
      }).then(() => {
        sendPasswordResetEmail(auth, accountInfo[0])
          .then(() => {
            setDoc(doc(db, "users", newUser.uid), {
              rank: accountInfo[2],
              displayName: accountInfo[1],
              email: accountInfo[0]
            });
            notificationSystem('success', "Account created! New employee must check their email to 'reset' their password.")
            signInWithEmailAndPassword(auth, loginCreds[0], loginCreds[1])
            .then((userCredential) => {
              user = userCredential.user;
              getSystemData();
              getUserData();
            })
            .catch((error) => {
              const errorCode = error.code;
              const errorMessage = error.message;
              console.log(error);
              notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
            });
          })
          .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.log(error);
            notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
          });
      }).catch((error) => {
        console.log(error);
        notificationSystem('danger', error)
      });
    })
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(error);
      notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
    });
}

async function startLoading(){
  loadingProgress = 0;
  totalLoadingProccesses = 8 // CHANGE ME

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading system data...'))
  await getSystemData();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading user data...'))
  let theUserData = await getUserData();
  if (!theUserData) {
    return
  }
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading members...'))
  await startGatherAllMembers();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading activity...'))
  await startGatherAllActivity();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading register...'))
  await registerStatus();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading categories...'))
  await startGatherAllCategories();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading products...'))
  await startGatherAllProducts();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading discounts...'))
  await startGatherAllDiscounts();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Finished loading!'))
  goHome(true);
//    createMail(Array('matthew@striks.com'), 'Test email!', "Test!", "Test")
  await updateTLID();
}

async function getSystemData(){
  const docRef = doc(db, "system", "system");
  const docSnap = await getDoc(docRef);
  let userAllowed = false
  if (userData) {
    userAllowed = canUser("permissionEditSystemSettings");    
  }

  if (docSnap.exists()) {
    systemData = docSnap.data();
    systemData.fileSaveSystemDir = null
    let fileSel = false

    if (!Array.isArray(systemData.fileSaveSystem)) {
      systemData.fileSaveSystemDir = systemData.fileSaveSystem
      return true
    }
    systemData.fileSaveSystem.forEach(theDir => {
      if (fs.existsSync(theDir) && !fileSel) {
        fileSel = true
        systemData.fileSaveSystemDir = theDir
      }
    });  
    if (!fileSel && userAllowed) {
      updateFileDir()
    }  
    return true
  }
}

async function updateFileDir(){
  dialog.showOpenDialog(mainWin, {
    properties: ['openDirectory']
  }).then(async result => {
    if (!result.canceled) {
      let theNewDirSingle = result.filePaths[0];
      let theDirsArray = Array()
      if (Array.isArray(systemData.fileSaveSystem)) {
        systemData.fileSaveSystem.forEach(theDir => {
          theDirsArray.push(theDir)
        });        
      }
      theDirsArray.push(theNewDirSingle)      
      systemData.fileSaveSystemDir = theNewDirSingle
      const docRef = doc(db, "system", "system");
      await updateDoc(docRef, {
        fileSaveSystem: theDirsArray
      });
      await getSystemData()
      goHome()      
    }
  }).catch(err => {
    console.log(err)
  })
}

ipcMain.on('remove-dir', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    goHome()
    setTimeout(function () {
      notificationSystem('danger', 'You do not have access to this.')
    }, 1000)
    return false
  }
  let theDirsArray = Array()
  systemData.fileSaveSystem.forEach(theDir => {
    if (theDir != arg) {
      theDirsArray.push(theDir)      
    }
  });
  if (systemData.fileSaveSystemDir == arg) {
  }
  const docRef = doc(db, "system", "system");
  await updateDoc(docRef, {
    fileSaveSystem: theDirsArray
  });
  await getSystemData()
  goAccount()
})

async function updateLID(){
  const docRef = doc(db, "system", "system");
  systemData.lid = systemData.lid + 1
  await updateDoc(docRef, {
    lid: systemData.lid
  });
}

async function updateOrderCustomerID(orderID, theCustomerID){
  const docRef = doc(db, "orders", orderID);
  await updateDoc(docRef, {
    customerID: theCustomerID
  });  
}

function userLogout(){
  user = null;
  userData = null;
  autoLogin = false;
  loadAuth();
}

async function getUserData(){
  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    userData = docSnap.data();
    let userAllowed = canUser("permissionEditSystemSettings");
    let fileSel = false

    if (!Array.isArray(systemData.fileSaveSystem)) {
      systemData.fileSaveSystemDir = systemData.fileSaveSystem
      fileSel = true
    }else{
      systemData.fileSaveSystem.forEach(theDir => {
        if (fs.existsSync(theDir) && !fileSel) {
          fileSel = true
          systemData.fileSaveSystemDir = theDir
        }
      });
    }

    if (!fileSel && userAllowed) {
      updateFileDir()
    } else if (!fileSel){
      setTimeout(() => {
        notificationSystem('warning', 'There is no directory saved for your report storage. Please contact a manager to address this ASAP!')
        let theMsg = 'There is currently no directory saved for you report storage. Please login to the system on the PC named ' + theHostName + ', and select a directory where you want the reports to save when promoted to do so.'
        createMail(systemData.invWarnEMail, "Report save error!", theMsg, theMsg)
      }, 5000);
    }
    
    return true
  }else{
    theClient.send('send-loading-progress', Array(0, 0, 'ACCOUNT DEACTIVATED!!! CONTACT MANAGER!!! Click <a href="login.html">here</a> to return to login...'))
    return false
  }
}

async function runAnalytics(timeStart, timeEnd){
  notificationSystem('warning', 'Running analytics...')
  let activitysDataSend = Array()
  let ordersDataSend = Array()

  if (timeStart) {
    let theTimeStartDate = new Date(timeStart);
    let theTimeStartSec = Math.floor(theTimeStartDate / 1000)
    let theTimeEndDate = new Date(timeEnd);
    let theTimeEndSec = Math.floor(theTimeEndDate / 1000)
    activitysData.forEach(activity => {
      if (activity[1].timeIn.seconds > theTimeStartSec && activity[1].timeIn.seconds < theTimeEndSec){
        activitysDataSend.push(activity)
      }
    });
    ordersData.forEach(order => {
      if (order[1].timestamp.seconds > theTimeStartSec && order[1].timestamp.seconds < theTimeEndSec){
        ordersDataSend.push(order)
      }
    });
    setTimeout(() => {
      theClient.send('analytics-return', Array(membersData, activitysDataSend, productsData, ordersDataSend));      
      setTimeout(() => {
        notificationSystem('success', 'Analytics gathered!')
      }, 5000);
    }, 3000);
  }else{
    theClient.send('analytics-return', Array(membersData, activitysData, productsData, ordersData));    
    setTimeout(() => {
      notificationSystem('success', 'Analytics gathered!')
    }, 5000);
  }
}

async function openMembership(memberID) {
  goMembers();
  let theMembersData = await getMemberInfo(memberID);
  let alreadyThere = false;
  let membersDataBrokenDown = membersData.slice(Math.max(membersData.length - 10, 0))
  membersDataBrokenDown.forEach((member) => {
    if (member[0] == memberID) {
      alreadyThere = true
    }
  })
  if (!alreadyThere) {
    theClient.send('membership-request-return', Array(memberID, theMembersData))
  }
  setTimeout(function () {
    theClient.send('open-membership-return', memberID);
  }, 1000)
}

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: '/assets/cerms-icon.icns',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
    });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWin = mainWindow
};

const createUploadImageScreen = () => {
  const uploadImgWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  uploadImgWindow.loadFile(path.join(__dirname, 'uploadimage.html'));

  uploadImgWin = uploadImgWindow
}

function emailReciept(theEMail){
  let p = path.join(__dirname, '.', 'last-reciept.html');
  fs.readFile(p, 'utf-8', (err, data) => {
    if (err) {
      console.log(err.message);
      return;
    }
    createMail(theEMail, 'Reciept!', data, data)              
  })
}
const createRecieptScreen = (shouldChoice) => {
  const recieptWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
    });

  recieptWindow.loadFile(path.join(__dirname, 'last-reciept.html'));

  recieptWin = recieptWindow
  
  if (shouldChoice) {
    const recieptWindowChild = new BrowserWindow({ 
      parent: recieptWin,
      width: 450,
      height: 200,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    })
    recieptWinChild = recieptWindowChild
    recieptWindowChild.show()
    recieptWin.show()    
    recieptWindowChild.loadFile(path.join(__dirname, 'reciept-choice.html'));
  }else{
    //https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback
    const options = {
      silent: false
    }
    recieptWin.webContents.print(options, (success, errorType) => {
      if (!success) {
        console.log(errorType)
        recieptWin.close()
      } else {
        recieptWin.close()
      }
    })
  }
};

app.on('ready', createWindow);

app.setAboutPanelOptions({
  applicationName: "CERMS",
  applicationVersion: app.getVersion(),
  credits: "Created by Matthew Striks / clubentertainmentrms.com"
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPCMain's

ipcMain.on('getClient', (event, arg) => {
  if (!theClient) {
    theClient = event.sender;
    loadAuth();
  }
})

ipcMain.on('account-login', (event, arg) => {
  theClient = event.sender;
  attemptLogin(arg)
})

ipcMain.on('account-auto-login', (event, arg) => {
  theClient = event.sender;
  if (autoLogin) {
    // Dev
    if (devMode) {
      attemptLogin(Array('matthew@striks.com', 'P@SSW0RD'))
    }
  }
})

ipcMain.on('request-login-info', (event, arg) => {
  theClient = event.sender;
  let theDisplayName = getDisplayName();
  theClient.send('recieve-login-info', theDisplayName)
})

ipcMain.on('account-logout', (event, arg) => {
  userLogout();
})

ipcMain.on('membership-create', (event, arg) => {
  theClient = event.sender;
  createOrder(Array(false, arg[3], arg[0] + ' ' + arg[1]), 'membership', arg)
})

ipcMain.on('membership-update', async (event, arg) => {
  theClient = event.sender;
  if (arg[11]) {
    createOrder(Array(arg[0], arg[4], arg[1] + ' ' + arg[2]), 'updatemembership', arg)        
  }else{
    editMembership(arg);
  }
})

ipcMain.on('membership-request', (event, arg) => {
  theClient = event.sender;
  displayAllMembers()
})

ipcMain.on('membership-request-dna', (event, arg) => {
  theClient = event.sender;
  displayAllDNAMembers()
})

ipcMain.on('rentals-request', (event, arg) => {
  theClient = event.sender;
  productsData.forEach(product => {
    if (product[1].rental) {
      theClient.send('rentals-request-return', product[1].name)
    }
  });
})

ipcMain.on('product-membership-request', (event, arg) => {
  theClient = event.sender;
  productsData.forEach(product => {
    if (product[1].membership) {
      theClient.send('product-membership-request-return', Array(product[0], product[1]))
    }
  });
})

ipcMain.on('history-request', (event, arg) => {
  theClient = event.sender;
  displayAllHistory()
  displayAllOrders()
})

ipcMain.on('request-account', (event, arg) => {
  theClient = event.sender;
  let displayName = getDisplayName();
  let rank = getRank();
  theClient.send('recieve-account', Array(displayName, rank, systemData))
})

ipcMain.on('account-create', (event, arg) => {
  theClient = event.sender;
  createAccount(arg);
})

ipcMain.on('request-users', (event, arg) => {
  theClient = event.sender;
  gatherAllUsers()
})

ipcMain.on('account-edit', async (event, arg) => {
  //RANK
  theClient = event.sender;
  let theRank = await getRank()
  if (theRank != "1") {
    return
  }
  const docRef = doc(db, "users", arg[0]);
  updateDoc(docRef, {
    displayName: arg[1],
    rank: arg[2],
    permissionViewProductsPage: arg[3],
    permissionEditCategory: arg[4],
    permissionEditProducts: arg[5],
    permissionEditDiscounts: arg[6],
    permissionEditCoreProducts: arg[7],
    permissionEditSystemSettings: arg[8],
    permissionEditRegisters: arg[9]
  });
  theClient.send('account-edit-success')
  notificationSystem('success', 'Account edited!')
})

ipcMain.on('account-change-password', (event, arg) => {
  theClient = event.sender;

  if (Array.isArray(arg)) {
    resetUserPassword(0, arg[0])
  }else{
    resetUserPassword(arg, false)
  }
})

ipcMain.on('account-delete-user', async (event, arg) => {
  theClient = event.sender;
  let theRank = await getRank();
  if (theRank == "1") {
    await deleteDoc(doc(db, "users", arg[0]));
  } else {
    console.log('No permissions!');
  }
  createMail("matthew@striks.com", "!!DELETE ACCOUNT!!", "You can delete the account with UID " + arg[0], "You can delete the account with UID " + arg[0] + " Click <a href='https://console.firebase.google.com/u/0/project/club-pittsburgh-entry-6be3b/authentication/users'>here</a>!")
  notificationSystem('warning', 'Account deleted!')
  theClient.send('account-edit-success')
})

ipcMain.on('activity-create', (event, arg) => {
  theClient = event.sender;
  createOrder(arg, 'activity', arg)
})

ipcMain.on('activity-renew', (event, arg) => {
  theClient = event.sender;
  createOrder(Array(arg[2], arg[1][2], false), 'renew', arg)
})

ipcMain.on('activity-close', (event, arg) => {
  theClient = event.sender;
  closeActivity(arg)
  theClient.send('activity-request-return-remove')
})

ipcMain.on('activity-request', (event, arg) => {
  theClient = event.sender;
  displayAllActivity();
  theClient.send('recieve-renew-time', systemData.renewTime)
})

ipcMain.on('activity-update-lockerroom', (event, arg) => {
  theClient = event.sender;
  addLockerRoom(arg);
})

ipcMain.on('activity-change-inout', (event, arg) => {
  theClient = event.sender;
  changeInOut(arg);
})

ipcMain.on('activity-change-waitlist', (event, arg) => {
  theClient = event.sender;
  changeWaitlist(arg);
})

ipcMain.on('member-dna', (event, arg) => {
  theClient = event.sender;
  memberDNA(arg);
})

ipcMain.on('member-undna', (event, arg) => {
  theClient = event.sender;
  memberUNDNA(arg);
})

ipcMain.on('member-tag', (event, arg) => {
  theClient = event.sender;
  memberTag(arg);
})

ipcMain.on('member-untag', (event, arg) => {
  theClient = event.sender;
  memberUNTag(arg);
})

ipcMain.on('open-membership', async (event, arg) => {
  theClient = event.sender;
  openMembership(arg)
})

ipcMain.on('open-reciept', async (event, arg) => {
  theClient = event.sender;
  viewOrderReciept(arg)
})

ipcMain.on('open-membership-activity', async (event, arg) => {
  theClient = event.sender;
  let theMember = await getMemberFromActivity(arg)
  openMembership(theMember)
})

ipcMain.on('analytics-run', (event, arg) => {
  theClient = event.sender;
  runAnalytics(arg[0], arg[1]);
})

ipcMain.on('member-history-request', (event, arg) => {
  theClient = event.sender;
  gatherMemberHistory(arg)
  gatherOrderHistory(arg)
})

ipcMain.on('membership-delete', (event, arg) => {
  theClient = event.sender;
  deleteMember(arg)
})

ipcMain.on('rank-request', async (event, arg) => {
  theClient = event.sender;
  let theRank = await getRank();
  theClient.send('rank-request-return', theRank)
})

ipcMain.on('activity-edit', (event, arg) => {
  theClient = event.sender;
  editActivity(arg)
})

ipcMain.on('searchForMember', (event, arg) => {
  theClient = event.sender;
  let wasFound = false
  if (arg != "") {
    for (i = 0; i < membersData.length; i++) {
      let theName = membersData[i][1].name.toUpperCase()
      let theID = Number(membersData[i][1].idnum)
      let brokenArg = arg.split(" ");
      if (theName.includes(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      } else if (theID == Number(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      }else{
        brokenArg.forEach((item, itemi) => {
          if (theName.includes(item) && !wasFound) {
            wasFound = true
            theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
          }
        });
      }
    }
  } else{
    displayAllMembers()
  }
  if (!wasFound) {
    notificationSystem('warning', 'No member was found by the search "' + arg + '"')
  }
})

ipcMain.on('create-category', (event, arg) => {
  theClient = event.sender;
  createCategory(arg[0], arg[1], arg[2]);
})

ipcMain.on('check-products-perms', async (event, arg) => {
  theClient = event.sender;
  let isAllowed = await canUser('permissionViewProductsPage')
  if (!isAllowed) {
    goHome()
    setTimeout(function(){
      notificationSystem('danger', 'You do not have access to this.')
    }, 1000)
  }
})

ipcMain.on('gather-categories', (event, arg) => {
  theClient = event.sender;
  displayAllCategories()
})

ipcMain.on('edit-category', (event, arg) => {
  theClient = event.sender;
  editCategory(arg)
})

ipcMain.on('remove-category', (event, arg) => {
  theClient = event.sender;
  removeCategory(arg)
})

ipcMain.on('create-product', (event, arg) => {
  theClient = event.sender;
  createProduct(arg[0], arg[1], arg[2], arg[3], arg[4], arg[5], arg[6], arg[7], arg[8], arg[9], arg[10], arg[11], arg[12], arg[13], arg[14])
})

ipcMain.on('gather-products-order', (event, arg) => {
  theClient = event.sender;
  displayAllProductsOrder()
})

ipcMain.on('gather-products', (event, arg) => {
  theClient = event.sender;
  displayAllProducts()
})

ipcMain.on('edit-product', (event, arg) => {
  theClient = event.sender;
  editProduct(arg)
})

ipcMain.on('remove-product', (event, arg) => {
  theClient = event.sender;
  removeProduct(arg)
})

ipcMain.on('gather-discounts', (event, arg) => {
  theClient = event.sender;
  displayAllDiscounts()
})

ipcMain.on('create-discount', (event, arg) => {
  theClient = event.sender;
  console.log(arg);
  createDiscount(arg[0], arg[1], arg[2], arg[3], arg[4], arg[5], arg[6], arg[7], arg[8], arg[9], arg[10])
})

ipcMain.on('edit-discount', (event, arg) => {
  theClient = event.sender;
  editDiscount(arg)
})

ipcMain.on('remove-discount', (event, arg) => {
  theClient = event.sender;
  removeDiscount(arg)
})

ipcMain.on('register-status-request', (event, arg) => {
  theClient = event.sender;
  registerStatus()
})

ipcMain.on('register-all-request', (event, arg) => {
  theClient = event.sender;
  gatherAllRegisters()
})

ipcMain.on('starting-register', (event, arg) => {
  theClient = event.sender;
  startRegister(arg)
})

ipcMain.on('ending-register', (event, arg) => {
  theClient = event.sender;
  endRegister(arg[0], arg[1])
})

ipcMain.on('drop-register', (event, arg) => {
  theClient = event.sender;
  //function updateRegisterSub(registerInfo: any, amount: any, total: any, drop: any): Promise<void>
  updateRegisterSub(arg[0], Array(0, 0, -arg[1]), false, true)
})

ipcMain.on('manage-ending-register', (event, arg) => {
  theClient = event.sender;
  manageEndRegister(arg)
})

ipcMain.on('order-checkout', (event, arg) => {
  theClient = event.sender;
  completeOrder(arg)
})

ipcMain.on('member-create-order', (event, arg) => {
  theClient = event.sender;
  createOrder(Array(arg, false, false), 'order', false)
})

ipcMain.on('edit-save-dir', (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (userAllowed) {
    updateFileDir()    
  }
})

ipcMain.on('edit-invWarn', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (userAllowed) {
    const docRef = doc(db, "system", "system");
    await updateDoc(docRef, {
      invWarnEMail: arg
    });
    await getSystemData()
    goHome()      
  }
})

ipcMain.on('edit-renew-time', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (userAllowed) {
    const docRef = doc(db, "system", "system");
    await updateDoc(docRef, {
      renewTime: arg
    });
    await getSystemData()
    goHome()      
  }
})

ipcMain.on('quick-sale', (event, arg) => {
  theClient = event.sender;
  createOrder(Array(arg, false, false), 'order', false)
})

ipcMain.on('generate-report-now', (event, arg) => {
  theClient = event.sender;
  startRegisterReport(false, true, false, false)
})

ipcMain.on('uploadProductImg', (event, arg) => {
  theClient2 = event.sender;
  let theConfig;
  theConfig = firebaseConfig    
  theClient2.send('uploadProductImg-return', Array(theConfig, theProductImgID))
})

ipcMain.on('uploadProductImg-complete', async (event, arg) => {
  theClient2 = event.sender;

  const docRef = doc(db, "products", arg[0]);
  await updateDoc(docRef, {
    image: arg[1]
  });
  uploadImgWin.close()
})

ipcMain.on('edit-product-img', (event, arg) => {
  theClient = event.sender;
  theProductImgID = arg
  createUploadImageScreen()
})

ipcMain.on('edit-product-img-remove', async (event, arg) => {
  theClient = event.sender;
  const docRef = doc(db, "products", arg);
  await updateDoc(docRef, {
    image: false
  });
  goProducts()
})

ipcMain.on('reciept-choice-print', (event, arg) => {
  recieptWin.close()
  createRecieptScreen(false)
})

ipcMain.on('reciept-choice-email', (event, arg) => {
  recieptWin.close()
  emailReciept(arg)
})

ipcMain.on('reciept-choice-pande', (event, arg) => {
  recieptWin.close()
  createRecieptScreen(false)
  emailReciept(arg)
})

ipcMain.on('reciept-choice-close', (event, arg) => {
  recieptWin.close()
})