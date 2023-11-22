const devMode = false;
const { app, BrowserWindow, ipcMain, dialog, webContents, shell, systemPreferences } = require('electron');
const { autoUpdater } = require('electron-updater');
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
const { getSystemMemoryInfo } = require('process');
const theHostName = os.hostname();
const OAuthClient = require('intuit-oauth');

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
const users = Array();
const usersData = Array();

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
let startGatherAllUsersA = false
let startGatherAllOrdersA = false

let pendingOrders = Array()
let pendingOrderType;
let pendingOrderInfo;
let pendingOrderID;
let lastMemberCreated;
let orderSuspended = false
let theLockerRoomInput
let theLockerRoomInput2

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

function loadAuth(){
  mainWin.unmaximize()
  mainWin.loadFile(path.join(__dirname, 'login.html'));
  autoUpdater.checkForUpdatesAndNotify();
}

function goHome(){
  mainWin.loadFile(path.join(__dirname, 'home.html'));
  mainWin.maximize()
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

function getSystemAccess(){
  return userData.access;
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
  if ((memberID == -1) || (Array.isArray(memberID))) {
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
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let stringStarter = getDisplayName() + ' [' + theStringTime + ']: '
  console.log("update: " + stringStarter);

  let theProductInfo
  productsData.forEach(product => {
    if (product[1].name == memberInfo[3]) {
      theProductInfo = product
    }
  });

  idExpiration = theCurrentTime + theProductInfo[1].membershipLength

  const docRef = doc(db, "members", memberID);
  await updateDoc(docRef, {
    notes: arrayUnion(stringStarter + memberInfo[4]),
    dna: false,
    id_expiration: idExpiration,
    membership_type: memberInfo[3]
  });
  theClient.send('membership-success', memberID)
}

async function memberDNA(memberInfo){
  await updateMemberNotes(memberInfo[0])
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let stringStarter = getDisplayName() + ' [' + theStringTime + ']: '
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    dna: true,
    notes: arrayUnion(stringStarter + memberInfo[1]),
  });
}

async function memberUNDNA(memberInfo){
  await updateMemberNotes(memberInfo[0])
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let stringStarter = getDisplayName() + ' [' + theStringTime + ']: '
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    dna: false,
    notes: arrayUnion(stringStarter + memberInfo[1]),
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
    access: getSystemAccess(),
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
    access: getSystemAccess(),
    name: catName,
    desc: catDesc,
    color: catColor
  });
  notificationSystem('success', 'Category created!')
  goProducts()
}

async function createProduct(proCat, proName, proPrice, proInvWarn, proDesc, proInv, proFavorite, proTaxable, proActive, proCore, proRental, proMembership, proMembershipLength, proMembershipLengthType, proInvPar, proBarcode, proRentalLength, proRentalLengthType){
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
  let theRentalLength = false
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
  if (proRental) {
    let theMultiple
    if (proRentalLengthType == 'hour') {
      theMultiple = 3600
    } else if (proRentalLengthType == 'day') {
      theMultiple = 86400      
    } else if (proRentalLengthType == 'week') {
      theMultiple = 604800      
    } else if (proRentalLengthType == 'month') {
      theMultiple = 2.628e+6
    } else if (proRentalLengthType == 'year') {
      theMultiple = 3.154e+7
    }
    theRentalLength = proRentalLength * theMultiple
  }
  const docRef = await addDoc(collection(db, 'products'), {
    access: getSystemAccess(),
    cat: proCat,
    name: proName,
    price: proPrice,
    invWarning: proInvWarn,
    desc: proDesc,
    inventory: proInv,
    inventoryPar: proInvPar,
    taxable: proFavorite,
    taxable: proTaxable,
    active: proActive,
    core: theProCore,
    rental: proRental,
    membership: proMembership,
    membershipLength: theMembershipLength,
    membershipLengthRaw: proMembershipLength,
    membershipLengthType: proMembershipLengthType,
    rentalLength: theRentalLength,
    rentalLengthRaw: proRentalLength,
    rentalLengthType: proRentalLengthType,
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
    access: getSystemAccess(),
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
  pendingOrderInfo = thePendingOrder
  pendingOrders.unshift(Array(memberInfo, orderType, thePendingOrder))

  let theMembersData
  if (memberInfo[0]) {
    theMembersData = await getMemberInfo(memberInfo[0]);
    theMembersName = theMembersData.name;
  }else{
    theMembersName = memberInfo[2]
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

async function addToOrder(memberInfo, thePendingOrder){
  let pendingOrderType = 'order'
  pendingOrders.unshift(Array(memberInfo, pendingOrderType, thePendingOrder))

  let theMembersData
  if (memberInfo[0]) {
    theMembersData = await getMemberInfo(memberInfo[0]);
    theMembersName = theMembersData.name;
  } else {
    theMembersName = memberInfo[2]
  }
}

async function suspendOrder() {
  if (!regStatus) {
    setTimeout(() => {
      notificationSystem('warning', 'There is no register currently active. You must activate a register to create an order.')
    }, 1000);
    setTimeout(() => {
      goRegister()
    }, 3000);
    return
  }
  orderSuspended = true
}

async function resumeOrder(){
  await goOrder()
  let memberChosenTF = false
  let memberChosen
  let theMemberChosen
  pendingOrders.forEach(async porder => {
    let memberInfo = porder[0]
    let theMembersData
    if (memberChosenTF) {
      theMembersData = memberChosen
      theMembersName = theMemberChosen;
    } else{
      if (memberInfo[0]) {
        theMembersData = await getMemberInfo(memberInfo[0]);
        theMembersName = theMembersData.name;
        memberChosenTF = true
        memberChosen = await getMemberInfo(memberInfo[0]);
        theMemberChosen = theMembersData.name;
      } else {
        memberChosenTF = true
        theMembersName = memberInfo[2]
        theMemberChosen = memberInfo[2]
      }
    }
    setTimeout(function () {
      theClient.send('send-customer-info', Array(theMembersName, theMembersData, memberInfo[0]))
      productsData.forEach((item, i) => {
        let theName
        if (porder[1] == 'membership') {
          theName = porder[0][1]
        } else if (porder[1] == 'activity') {
          theName = porder[2][1]
        }
        if (porder[2][1] && (item[1].name == theName)) {
          theClient.send('send-product-info', item)
        }
      });
    }, 1000)
  });
}

async function viewOrderReciept(theOrderNumber){
  let p2 = path.join(__dirname, '.', 'last-reciept.html');
  let theReciept = ""

  const docRef = doc(db, "orders", theOrderNumber);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    theReciept = docSnap.data().reciept
    fs.writeFile(p2, theReciept, err => {
      if (err) {
        console.error(err);
      }
      createRecieptScreen(true)
    });
  } else {
    return false;
  }
}

async function registerReciept(registerID){
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let theDisplayName = await getDisplayName()
  let p2 = path.join(__dirname, '.', 'last-reciept.html');

  const docRef = doc(db, "registers", registerID);
  const docSnap = await getDoc(docRef);
  let registerInfo = docSnap.data()

  let theHTML
  let withDate
  let withCashier
  let withInput100
  let withInput50
  let withInput20
  let withInput10
  let withInput5
  let withInput1
  let withInput25C
  let withInput10C
  let withInput5C
  let withInput1C

  formatter.format(Math.round((Number(registerInfo.starting) + Number.EPSILON) * 100) / 100)
  

  theHTML = systemData.registerReciept
  withDate = theHTML.replace('TheDate', theStringTime)
  withCashier = withDate.replace('TheCashier', theDisplayName)
  withInput100 = withCashier.replace('Input100', registerInfo.input100)
  withInput50 = withInput100.replace('Input50', registerInfo.input50)
  withInput20 = withInput50.replace('Input20', registerInfo.input20)
  withInput10 = withInput20.replace('Input10', registerInfo.input10)
  withInput5 = withInput10.replace('Input5', registerInfo.input5)
  withInput1 = withInput5.replace('Input1', registerInfo.input1)
  withInput25C = withInput1.replace('Input25c', registerInfo.input25c)
  withInput10C = withInput25C.replace('Input10c', registerInfo.input10c)
  withInput5C = withInput10C.replace('Input05c', registerInfo.input5c)
  withInput1C = withInput5C.replace('Input01c', registerInfo.input1c)
  withTotal = withInput1C.replace('TheTotal', registerInfo.ending)
  withStarting = withTotal.replace('TheExpTotal', registerInfo.starting)
  withDiff = withStarting.replace('TheDifference', (formatter.format(Math.round((Number(registerInfo.starting) + Number.EPSILON) * 100) / 100) - formatter.format(Math.round((Number(registerInfo.ending) + Number.EPSILON) * 100) / 100)))
  withChargeTotal = withDiff.replace('TheTotalCharge', formatter.format(Math.round((Number(registerInfo.ccard) + Number.EPSILON) * 100) / 100))

  fs.writeFile(p2, withChargeTotal, err => {
    if (err) {
      console.error(err);
    }
    createRecieptScreen(false)
  });

  await updateDoc(docRef, {
    reciept: withChargeTotal
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

  if (orderInfo[2] && (orderInfo[2][0] != 0)) {
    const discountRef = doc(db, "discounts", orderInfo[2][0]);

    await updateDoc(discountRef, {
      used: increment(1)
    });
  }

  const toDate = new Date();
  let hour = toDate.getHours();

  let theShift = false

  if (hour >= 7 && hour <= 14) {
    theShift = 'B'
  } else if (hour >= 15 && hour <= 22) {
    theShift = 'C'
  } else if ((hour >= 23 || hour <= 6)) {
    theShift = 'A'
  }

  // paymentMethod: credit card, gift card, cash
  // total: Sub, Tax, Tot, OGTot
  const docRef = await addDoc(collection(db, "orders"), {
    access: getSystemAccess(),
    customerID: theCustomerID,
    products: orderInfo[1],
    discounts: orderInfo[2],
    total: orderInfo[3],
    paymentMethod: orderInfo[4],
    cashier: getUID(),
    timestamp: serverTimestamp(),
    shift: theShift
  });

  let registerInfo = await getActiveRegister()
  updateRegisterSub(registerInfo, orderInfo[4], orderInfo[3], false)

  pendingOrders.forEach(porder => {
    if (porder[1] == 'membership') {
      pendingOrderID = docRef.id
      createMembership(porder[2])
    } else if (porder[1] == 'updatemembership'){
      editMembership(porder[2])
    } else if (porder[1] == 'activity'){
      setTimeout(() => {
        createActivity(porder[2])        
      }, 2000);
    } else if (porder[1] == 'renew'){
      renewActivity(porder[2])
    }
  }); 
  setTimeout(() => {
    orderSuspended = false
    pendingOrders = Array()    
  }, 2000);
  goHome()

  for (let i = 0; i < orderInfo[1].length; i += 1) {
    await editProductInventory(orderInfo[1][i])
    await delay(1000)
  }

  recieptProcess(orderInfo, docRef.id)
}

async function createActivity(memberInfo){
  // [ 'zyTw1YM1bsk9dBigeZSy', 'Locker', '10', '', false, false ]
  // ['memberid', 'type', 'number', 'notes', waitlist, waiver?(false)]
  let theUserID = getUID();
  let theCurrentTime = Math.floor(Date.now() / 1000);

  productsData.forEach(async product => {
    if (product[1].name == memberInfo[1]) {
      let theRentalLength = product[1].rentalLength
      if (!product[1].rentalLength) {
        theRentalLength = 21600
      }
      let theTimeExpire = theCurrentTime + theRentalLength;
      let theMemberID = memberInfo[0]
      let useTheLockerRoomInput = memberInfo[2]
      let useTheLockerRoomInput2 = memberInfo[3]
      if (!useTheLockerRoomInput && (useTheLockerRoomInput != "")) {
        useTheLockerRoomInput = theLockerRoomInput
      }
      if (!useTheLockerRoomInput2 && (useTheLockerRoomInput2 != "")) {
        useTheLockerRoomInput2 = theLockerRoomInput2
      }
      if (theMemberID == 0) {
        theMemberID = lastMemberCreated
      }
      const docRef = await addDoc(collection(db, "activity"), {
        access: getSystemAccess(),
        active: true,
        goingInactive: false,
        waitlist: memberInfo[4],
        currIn: false,
        lockerRoomStatus: Array(
          true,
          useTheLockerRoomInput,
          memberInfo[1],
          theUserID,
          theCurrentTime,
          theTimeExpire
        ),
        memberID: theMemberID,
        notes: useTheLockerRoomInput2,
        timeIn: serverTimestamp(),
        timeOut: null
      });
      notificationSystem('success', 'Customer checked in!')

      if (memberInfo[5]) {
        const memberRef = doc(db, "members", theMemberID);
        await updateDoc(memberRef, {
          waiver_status: true
        });
      }
    }
  });
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
  docRef = query(collection(db, "registers"), where("active", "==", true), where("uid", "==", theUserID), where('access', '==', getSystemAccess()));
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
  const q = query(collection(db, "registers"), where("active", "==", true), where('uid', '!=', getUID()), where('access', '==', getSystemAccess()));
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

  if (registerInfo[1] == 'B') {
    const q = query(collection(db, "registers"), where("active", "==", true), where("shift", '!=', 'd'), where('access', '==', getSystemAccess()));
    let stillOpen = false
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      stillOpen = true
    });
    if (stillOpen) {
      notificationSystem('danger', 'Please ensure all registers are closed before opening a dayshift drawer.')
      return
    }else{
      startRegisterReport(false, true)
    }

    getSystemData()
  }

  const docRef = await addDoc(collection(db, "registers"), {
    access: getSystemAccess(),
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
  startRegisterReport(registerInfo[0], false)
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
  registerReciept(regStatusID)
  startRegisterReport(regStatusID, false)
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

async function startRegisterReport(registerID, isFinal) {
  notificationSystem('warning', 'Generating register report... Do not shut down application.')
  getSystemData()
  let registerInfo
  let startDateStr
  let theShift = false
  let reportType = 'Generated'
  let cashName = 'No Cashier Assigned (Full Report)'
  let startDates

  let totalMoneyA = 0
  let totalMoneyB = 0
  let totalMoneyC = 0

  let totalTaxA = 0
  let totalTaxB = 0
  let totalTaxC = 0

  let totalNetA = 0
  let totalNetB = 0
  let totalNetC = 0

  let totalCashA = 0
  let totalCashB = 0
  let totalCashC = 0

  let totalCCardA = 0
  let totalCCardB = 0
  let totalCCardC = 0

  let totalGCardA = 0
  let totalGCardB = 0
  let totalGCardC = 0

  let osA = 0
  let osB = 0
  let osC = 0

  let membershipTotalsA = 0
  let membershipTotalsB = 0
  let membershipTotalsC = 0

  let lockerTotalsA = 0
  let lockerTotalsB = 0
  let lockerTotalsC = 0

  let roomTotalsA = 0
  let roomTotalsB = 0
  let roomTotalsC = 0

  let counterTxTotalsA = 0
  let counterTxTotalsB = 0
  let counterTxTotalsC = 0

  let salesTxTotalsA = 0
  let salesTxTotalsB = 0
  let salesTxTotalsC = 0

  let noCounterTxTotalsA = 0
  let noCounterTxTotalsB = 0
  let noCounterTxTotalsC = 0

  let passThruTotalsA = 0
  let passThruTotalsB = 0
  let passThruTotalsC = 0

  let detailCCardA = 0
  let detailCCardB = 0
  let detailCCardC = 0

  let detailGCardA = 0
  let detailGCardB = 0
  let detailGCardC = 0

  let detailCashA = 0
  let detailCashB = 0
  let detailCashC = 0

  let detailNetA = 0
  let detailNetB = 0
  let detailNetC = 0

  let actualCashA = 0
  let actualCashB = 0
  let actualCashC = 0

  let chargeTotalA = 0
  let chargeTotalB = 0
  let chargeTotalC = 0

  const toDate = new Date();
  let day = toDate.getDate();
  let month = toDate.getMonth() + 1;
  let year = toDate.getFullYear();
  let hour = toDate.getHours();
  let min = toDate.getMinutes();
  let sec = toDate.getSeconds();
  let ampm = hour >= 12 ? 'PM' : 'AM';

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

  if (hour > 12) {
    hour = hour - 12
  }

  let currentDate = `${month}/${day}/${year}`;
  let yesterDate = `${month}/${day - 1}/${year}`;
  let currentDateFile = `${month}-${day}-${year}`;
  let currentTime = `${hour}:${min}:${sec} ${ampm}`;
  let currentTimeFile = `${hour}-${min}-${sec}-${ampm}`;

  currentDateStr = currentDate + ' ' + currentTime
  currentDateFileStr = currentDateFile + ' ' + currentTimeFile

  const ordersRef = collection(db, "orders");

  if (registerID) {
    reportType = 'Register'
    const docRef = doc(db, "registers", registerID);
    const docSnap = await getDoc(docRef);
    registerInfo = docSnap.data()
    let theCID = registerInfo.uid
    cashName = registerInfo.uname
    theShift = registerInfo.shift

    if (theShift == "A") {
      osA = (registerInfo.ending - registerInfo.starting)
      actualCashA = actualCashA + registerInfo.ending
      chargeTotalA = chargeTotalA + registerInfo.ccard
    } else if (theShift == "B") {
      osB = (registerInfo.ending - registerInfo.starting)
      actualCashB = actualCashB + registerInfo.ending
      chargeTotalB = chargeTotalB + registerInfo.ccard
    } else {
      osC = (registerInfo.ending - registerInfo.starting)
      actualCashC = actualCashC + registerInfo.ending
      chargeTotalC = chargeTotalC + registerInfo.ccard
    }

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

    if (hour > 12) {
      hour = hour - 12
    }

    let startDateS = `${month}/${day}/${year}`;
    let startTime = `${hour}:${min}:${sec} ${ampm}`;

    startDateStr = startDateS + ' ' + startTime
    startDates = new Date(registerInfo.timestampStart['seconds'] * 1000)
    q1 = query(ordersRef, where("timestamp", ">", registerInfo.timestampStart), where("timestamp", "<", registerInfo.timestampEnd), where("cashier", "==", theCID), where("access", "==", getSystemAccess()));
  } else if (!registerID && isFinal) {
    reportType = 'Final'
    startDates = new Date(yesterDate + ' 07:00');
    q1 = query(ordersRef, where("timestamp", ">", startDates), where("access", "==", getSystemAccess()));
  } else {
    reportType = 'Generated'
    startDates = new Date(currentDate + ' 07:00');
    q1 = query(ordersRef, where("timestamp", ">", startDates), where("access", "==", getSystemAccess()));
  }

  const startDate = startDates;
  let day2 = startDate.getDate();
  let month2 = startDate.getMonth() + 1;
  let year2 = startDate.getFullYear();
  let hour2 = startDate.getHours();
  let min2 = startDate.getMinutes();
  let sec2 = startDate.getSeconds();
  let ampm2 = hour >= 12 ? 'pm' : 'am';

  if (day2 < 10) {
    day2 = '0' + day2
  }

  if (month2 < 10) {
    month2 = '0' + month2
  }

  if (min2 < 10) {
    min2 = '0' + min2
  }

  if (sec2 < 10) {
    sec2 = '0' + sec2
  }

  if (hour2 > 12) {
    hour2 = hour2 - 12
  }

  let startDateS = `${month2}/${day2}/${year2}`;
  let startTime = `${hour2}:${min2}:${sec2} ${ampm2}`;

  startDateStr = startDateS + ' ' + startTime

  let productsAndAmounts = Array()
  let discountsAndAmounts = Array()
  productsData.forEach((product, i) => {
    productsAndAmounts.push(Array(product[0], 0))
  });
  discountsData.forEach((discount, i) => {
    discountsAndAmounts.push(Array(discount[0], 0))
  });

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

    let orderDate = new Date(orderInfo.timestamp['seconds'] * 1000)
    let day = orderDate.getDate();
    let month = orderDate.getMonth() + 1;
    let year = orderDate.getFullYear();
    let hour = orderDate.getHours();
    let min = orderDate.getMinutes();
    let sec = orderDate.getSeconds();
    let ampm = hour >= 12 ? 'PM' : 'AM';

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

    if (hour > 12) {
      hour = hour - 12
    }

    let orderDateStr = `${month}/${day}/${year}`;
    let orderTime = `${hour}:${min}:${sec} ${ampm}`;

    orderDateStrF = orderDateStr + ' ' + orderTime

    let totalMoney = orderInfo.total[0]
    let totalTax = orderInfo.total[1]
    let totalCCard = orderInfo.paymentMethod[0]
    let totalGCard = orderInfo.paymentMethod[1]
    let totalCash
    if (orderInfo.paymentMethod[3] < 0) {
      totalCash = (orderInfo.paymentMethod[2] + orderInfo.paymentMethod[3])
    } else {
      totalCash = orderInfo.paymentMethod[2]
    }

    orderInfo.products.forEach(orderProduct => {
      productsData.forEach(product => {
        if (orderProduct == product[0]) {
          if (product[1].membership) {
            if (orderInfo.shift == "A") {
              membershipTotalsA = membershipTotalsA + Number(product[1].price)
            } else if (orderInfo.shift == "B") {
              membershipTotalsB = membershipTotalsB + Number(product[1].price)
            } else if (orderInfo.shift == "C") {
              membershipTotalsC = membershipTotalsC + Number(product[1].price)
            }
          } else if (product[1].rental) {
            if (product[1].name.toUpperCase().includes('LOCKER')) {
              if (orderInfo.shift == "A") {
                lockerTotalsA = lockerTotalsA + Number(product[1].price)
              } else if (orderInfo.shift == "B") {
                lockerTotalsB = lockerTotalsB + Number(product[1].price)
              } else if (orderInfo.shift == "C") {
                lockerTotalsC = lockerTotalsC + Number(product[1].price)
              }
            } else {
              if (orderInfo.shift == "A") {
                roomTotalsA = roomTotalsA + Number(product[1].price)
              } else if (orderInfo.shift == "B") {
                roomTotalsB = roomTotalsB + Number(product[1].price)
              } else if (orderInfo.shift == "C") {
                roomTotalsC = roomTotalsC + Number(product[1].price)
              }
            }
          } else if (product[1].taxable) {
            if (orderInfo.shift == "A") {
              counterTxTotalsA = counterTxTotalsA + Number(product[1].price)
            } else if (orderInfo.shift == "B") {
              counterTxTotalsB = counterTxTotalsB + Number(product[1].price)
            } else if (orderInfo.shift == "C") {
              counterTxTotalsC = counterTxTotalsC + Number(product[1].price)
            }
          } else {
            if (orderInfo.shift == "A") {
              noCounterTxTotalsA = noCounterTxTotalsA + Number(product[1].price)
            } else if (orderInfo.shift == "B") {
              noCounterTxTotalsB = noCounterTxTotalsB + Number(product[1].price)
            } else if (orderInfo.shift == "C") {
              noCounterTxTotalsC = noCounterTxTotalsC + Number(product[1].price)
            }
          }
          // Add tax
          if (product[1].taxable) {
            if (orderInfo.shift == "A") {
              salesTxTotalsA = salesTxTotalsA + (Number(product[1].price) * .07)
            } else if (orderInfo.shift == "B") {
              salesTxTotalsB = salesTxTotalsB + (Number(product[1].price) * .07)
            } else if (orderInfo.shift == "C") {
              salesTxTotalsC = salesTxTotalsC + (Number(product[1].price) * .07)
            }
          }
        }
      });
    });

    // paymentMethod: credit card, gift card, cash, change
    // total: Sub, Tax, Tot, OGTot
    if (orderInfo.shift == "A") {
      totalMoneyA = totalMoneyA + totalMoney
      totalTaxA = totalTaxA + totalTax
      totalCCardA = totalCCardA + totalCCard
      totalGCardA = totalGCardA + totalGCard
      if (orderInfo.paymentMethod[3] < 0) {
        totalCashA = totalCashA + totalCash
      } else {
        totalCashA = totalCashA + totalCash
      }
      detailCCardA = detailCCardA + orderInfo.paymentMethod[0]
      detailGCardA = detailGCardA + orderInfo.paymentMethod[1]
      detailCashA = detailCashA + (orderInfo.paymentMethod[2] + orderInfo.paymentMethod[3])
    } else if (orderInfo.shift == "B") {
      totalMoneyB = totalMoneyB + totalMoney
      totalTaxB = totalTaxB + totalTax
      totalCCardB = totalCCardB + totalCCard
      totalGCardB = totalGCardB + totalGCard
      if (orderInfo.paymentMethod[3] < 0) {
        totalCashB = totalCashB + totalCash
      } else {
        totalCashB = totalCashB + totalCash
      }
      detailCCardB = detailCCardB + orderInfo.paymentMethod[0]
      detailGCardB = detailGCardB + orderInfo.paymentMethod[1]
      detailCashB = detailCashB + (orderInfo.paymentMethod[2] + orderInfo.paymentMethod[3])
    } else if (orderInfo.shift == "C") {
      totalMoneyC = totalMoneyC + totalMoney
      totalTaxC = totalTaxC + totalTax
      totalCCardC = totalCCardC + totalCCard
      totalGCardC = totalGCardC + totalGCard
      if (orderInfo.paymentMethod[3] < 0) {
        totalCashC = totalCashC + totalCash
      } else {
        totalCashC = totalCashC + totalCash
      }
      detailCCardC = detailCCardC + orderInfo.paymentMethod[0]
      detailGCardC = detailGCardC + orderInfo.paymentMethod[1]
      detailCashC = detailCashC + (orderInfo.paymentMethod[2] + orderInfo.paymentMethod[3])
    }
  })

  totalNetA = totalMoneyA + totalTaxA
  totalNetB = totalMoneyB + totalTaxB
  totalNetC = totalMoneyC + totalTaxC

  var wb = new xl.Workbook();
  var detailWB = wb.addWorksheet('Detail');
  var summaryWB = wb.addWorksheet('Summary');

  var boldStyle = wb.createStyle({
    font: {
      bold: true,
      size: 12
    }
  })

  var moneyStyle = wb.createStyle({
    numberFormat: '$#,##0.00; ($#,##0.00); -',
    font: {
      color: "#FF0800"
    }
  });

  let productDescLine = 16;
  let productNames = Array()
  productsData.forEach((product, i) => {
    productNames.push(product[1].name)
    detailWB.cell(productDescLine, 2)
      .string(product[1].name);
    productsAndAmounts.forEach((productsAA, i2) => {
      if (productsAA[0] == product[0]) {
        detailWB.cell(productDescLine, 3)
          .number(productsAA[1]);

        detailWB.cell(productDescLine, 4)
          .number(product[1].price * productsAA[1])
          .style(moneyStyle);
      }
    })
    productDescLine = productDescLine + 1
  });
  productDescLine = productDescLine + 1

  const lengthArr = productNames.map(productNames => productNames.length)
  const maxWidth = Math.max(...lengthArr)
  detailWB.column(2).setWidth(maxWidth)

  //      (Y, X)  
  detailWB.cell(1, 1)
    .string('CERMS')
    .style(boldStyle)
    .style({ font: { size: 20 } })

  detailWB.cell(1, 10)
    .string('Deposit Date/Time')
    .style(boldStyle)

  detailWB.cell(1, 12)
    .string(startDateStr)

  detailWB.cell(1, 15)
    .string('Cashier: ')
    .style(boldStyle)

  detailWB.cell(1, 17)
    .string(cashName)

  detailWB.cell(2, 1)
    .string("Deposit Detail Worksheet")
    .style(boldStyle)

  detailWB.cell(2, 3)
    .string(startDateStr)

  detailWB.cell(2, 10)
    .string('Weekday')

  detailWB.cell(3, 1)
    .string('CERMS 2.0')
    .style(boldStyle)

  detailWB.cell(3, 3)
    .string('7a - 3p')
    .style(boldStyle)

  detailWB.cell(3, 5)
    .string('3p - 11p')
    .style(boldStyle)

  detailWB.cell(3, 7)
    .string('11p - 7a')
    .style(boldStyle)

  detailWB.cell(4, 3)
    .string('#')
    .style(boldStyle)

  detailWB.cell(4, 4)
    .string('$')
    .style(boldStyle)

  detailWB.cell(5, 1)
    .string('DEPT TOTAL') // - tax
    .style(boldStyle)

  detailWB.cell(5, 4)
    .number(totalMoneyB) // total - tax (7a-3p)
    .style(moneyStyle)

  detailWB.cell(5, 6)
    .number(totalMoneyC) // total - tax (3p-11p)
    .style(moneyStyle)

  detailWB.cell(5, 8)
    .number(totalMoneyA) // total - tax (11p-7a)
    .style(moneyStyle)

  detailWB.cell(7, 2)
    .string("TAX")
    .style(boldStyle)

  detailWB.cell(7, 4)
    .number(totalTaxB) // tax (7a-3p)
    .style(moneyStyle)

  detailWB.cell(7, 6)
    .number(totalTaxC) // tax (3p-11p)
    .style(moneyStyle)

  detailWB.cell(7, 8)
    .number(totalTaxA) // tax (11p-7a)
    .style(moneyStyle)

  detailWB.cell(8, 2)
    .string("NET")

  detailWB.cell(8, 4)
    .number(totalNetB) // total + tax (7a-3p)
    .style(moneyStyle)

  detailWB.cell(8, 6)
    .number(totalNetC) // total + tax (3p-11p)
    .style(moneyStyle)

  detailWB.cell(8, 8)
    .number(totalNetA) // total + tax (11p-7a)
    .style(moneyStyle)

  detailWB.cell(10, 2)
    .string("CASH")
    .style(boldStyle)

  detailWB.cell(10, 4)
    .number(totalCashB) // cash (7a-3p)
    .style(moneyStyle)

  detailWB.cell(10, 6)
    .number(totalCashC) // cash (3p-11p)
    .style(moneyStyle)

  detailWB.cell(10, 8)
    .number(totalCashA) // cash (11p-7a)
    .style(moneyStyle)

  detailWB.cell(11, 2)
    .string("CCARD")
    .style(boldStyle)

  detailWB.cell(11, 4)
    .number(totalCCardB) // ccard (7a-3p)
    .style(moneyStyle)

  detailWB.cell(11, 6)
    .number(totalCCardC) // ccard (3p-11p)
    .style(moneyStyle)

  detailWB.cell(11, 8)
    .number(totalCCardA) // ccard (11p-7a)
    .style(moneyStyle)

  detailWB.cell(12, 2)
    .string("GIFT CARDS")
    .style(boldStyle)

  detailWB.cell(12, 4)
    .number(totalGCardB) // gcard (7a-3p)
    .style(moneyStyle)

  detailWB.cell(12, 6)
    .number(totalGCardC) // gcard (3p-11p)
    .style(moneyStyle)

  detailWB.cell(12, 8)
    .number(totalGCardA) // gcard (11p-7a)
    .style(moneyStyle)

  detailWB.cell(13, 2)
    .string('Over/(Short)')

  detailWB.cell(13, 4)
    .number(osB) // OS (7a-3p)
    .style(moneyStyle)

  detailWB.cell(13, 6)
    .number(osC) // OS (3p-11p)
    .style(moneyStyle)

  detailWB.cell(13, 8)
    .number(osA) // OS (11p-7a)
    .style(moneyStyle)

  detailWB.cell(15, 2)
    .string('Description')
    .style(boldStyle)

  summaryWB.cell(1, 1)
    .string("CERMS")
    .style(boldStyle)

  summaryWB.cell(1, 4)
    .string('Deposit Journal Worksheet')
    .style(boldStyle)

  summaryWB.cell(1, 7)
    .string('Deposit Date/Time')
    .style(boldStyle)

  summaryWB.cell(1, 9)
    .string(startDateStr)

  summaryWB.cell(1, 11)
    .string('Cashier: ')
    .style(boldStyle)

  summaryWB.cell(1, 13)
    .string(cashName)

  summaryWB.cell(1, 16)
    .string('CERMS 2.0')
    .style(boldStyle)

  summaryWB.cell(3, 1)
    .string("Biz Date")
    .style(boldStyle)

  summaryWB.cell(3, 2)
    .string("Shift")
    .style(boldStyle)

  summaryWB.cell(3, 3)
    .string("Memberships")
    .style(boldStyle)

  summaryWB.cell(3, 4)
    .string("Locker")
    .style(boldStyle)

  summaryWB.cell(3, 5)
    .string("Room")
    .style(boldStyle)

  summaryWB.cell(3, 6)
    .string("CounterTx")
    .style(boldStyle)

  summaryWB.cell(3, 7)
    .string("SalesTx")
    .style(boldStyle)

  summaryWB.cell(3, 8)
    .string("NoCounterTx")
    .style(boldStyle)

  summaryWB.cell(3, 9)
    .string("PassThru")
    .style(boldStyle)

  summaryWB.cell(3, 10)
    .string("Days Gross")
    .style(boldStyle)

  summaryWB.cell(3, 11)
    .string("Weekday")
    .style(boldStyle)

  summaryWB.cell(5, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(5, 2)
    .string("7a to 3p")
    .style(boldStyle)

  summaryWB.cell(5, 3)
    .number(membershipTotalsB) // Memberships (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 4)
    .number(lockerTotalsB) // Locker (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 5)
    .number(roomTotalsB) // Room (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 6)
    .number(counterTxTotalsB) // CounterTx (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 7)
    .number(salesTxTotalsB) // SalesTx (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 8)
    .number(noCounterTxTotalsB) // NoCounterTx (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(5, 9)
    .number(passThruTotalsB) // PassThru (7a-3p)
    .style(moneyStyle)

  let daysGrossB = (membershipTotalsB + lockerTotalsB + roomTotalsB + counterTxTotalsB + salesTxTotalsB + noCounterTxTotalsB + passThruTotalsB)
  summaryWB.cell(5, 10)
    .number(daysGrossB) // Days Gross (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(6, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(6, 2)
    .string("3p to 11p")
    .style(boldStyle)

  summaryWB.cell(6, 3)
    .number(membershipTotalsC) // Memberships (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 4)
    .number(lockerTotalsC) // Locker (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 5)
    .number(roomTotalsC) // Room (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 6)
    .number(counterTxTotalsC) // CounterTx (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 7)
    .number(salesTxTotalsC) // SalesTx (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 8)
    .number(noCounterTxTotalsC) // NoCounterTx (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(6, 9)
    .number(passThruTotalsC) // PassThru (3p-11p)
    .style(moneyStyle)

  let daysGrossC = (membershipTotalsC + lockerTotalsC + roomTotalsC + counterTxTotalsC + salesTxTotalsC + noCounterTxTotalsC + passThruTotalsC)
  summaryWB.cell(6, 10)
    .number(daysGrossC) // Days Gross (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(7, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(7, 2)
    .string("11p to 7a")
    .style(boldStyle)

  summaryWB.cell(7, 3)
    .number(membershipTotalsA) // Memberships (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 4)
    .number(lockerTotalsA) // Locker (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 5)
    .number(roomTotalsA) // Room (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 6)
    .number(counterTxTotalsA) // CounterTx (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 7)
    .number(salesTxTotalsA) // SalesTx (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 8)
    .number(noCounterTxTotalsA) // NoCounterTx (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(7, 9)
    .number(passThruTotalsA) // PassThru (11p-7a)
    .style(moneyStyle)

  let daysGrossA = (membershipTotalsA + lockerTotalsA + roomTotalsA + counterTxTotalsA + salesTxTotalsA + noCounterTxTotalsA + passThruTotalsA)
  summaryWB.cell(7, 10)
    .number(daysGrossA) // Days Gross (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(9, 1)
    .string('TOTALS')
    .style(boldStyle)

  summaryWB.cell(9, 3)
    .number((membershipTotalsA + membershipTotalsB + membershipTotalsC)) // Membership Totals
    .style(moneyStyle)

  summaryWB.cell(9, 4)
    .number((lockerTotalsA + lockerTotalsB + lockerTotalsC)) // Locker Totals
    .style(moneyStyle)

  summaryWB.cell(9, 5)
    .number((roomTotalsA + roomTotalsB + roomTotalsC)) // Room Totals
    .style(moneyStyle)

  summaryWB.cell(9, 6)
    .number((counterTxTotalsA + counterTxTotalsB + counterTxTotalsC)) // CounterTx Totals
    .style(moneyStyle)

  summaryWB.cell(9, 7)
    .number((salesTxTotalsA + salesTxTotalsB + salesTxTotalsC)) // SalesTx Totals
    .style(moneyStyle)

  summaryWB.cell(9, 8)
    .number((noCounterTxTotalsA + noCounterTxTotalsB + noCounterTxTotalsC)) // NoCounterTx Totals
    .style(moneyStyle)

  summaryWB.cell(9, 9)
    .number((passThruTotalsA + passThruTotalsB + passThruTotalsC)) // PassThru Totals
    .style(moneyStyle)

  summaryWB.cell(9, 10)
    .number((daysGrossA + daysGrossB + daysGrossC)) // Days Gross Totals
    .style(moneyStyle)
    .style(boldStyle)

  summaryWB.cell(9, 11)
    .string("") // Weekday

  summaryWB.cell(11, 1)
    .string('Biz Date')
    .style(boldStyle)

  summaryWB.cell(11, 2)
    .string('Shift')
    .style(boldStyle)

  summaryWB.cell(11, 3)
    .string('Detail CCard')
    .style(boldStyle)

  summaryWB.cell(11, 4)
    .string('Detail GCard')
    .style(boldStyle)

  summaryWB.cell(11, 5)
    .string('Detail Cash')
    .style(boldStyle)

  summaryWB.cell(11, 6)
    .string('Detail Net')
    .style(boldStyle)

  summaryWB.cell(11, 7)
    .string('Actual Cash')
    .style(boldStyle)

  summaryWB.cell(11, 8)
    .string('Over/(Short)')
    .style(boldStyle)

  summaryWB.cell(11, 9)
    .string('Charge Total')
    .style(boldStyle)

  summaryWB.cell(13, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(13, 2)
    .string('7a to 3p')
    .style(boldStyle)

  summaryWB.cell(13, 3)
    .number(detailCCardB) // Detail CCard (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 4)
    .number(detailGCardB) // Detail GCard (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 5)
    .number(detailCashB) // Detail Cash (7a-3p)
    .style(moneyStyle)

  detailNetB = (detailCCardB + detailGCardB + detailCashB)
  summaryWB.cell(13, 6)
    .number(detailNetB) // Detail Net (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 7)
    .number(actualCashB) // Actual Cash (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 8)
    .number(osB) // OS (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 9)
    .number(chargeTotalB) // Charge Total (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(14, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(14, 2)
    .string('3p to 11p')
    .style(boldStyle)

  summaryWB.cell(14, 3)
    .number(detailCCardC) // Detail CCard (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(14, 4)
    .number(detailGCardC) // Detail GCard (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(14, 5)
    .number(detailCashC) // Detail Cash (3p-11p)
    .style(moneyStyle)

  detailNetC = (detailCCardC + detailGCardC + detailCashC)
  summaryWB.cell(14, 6)
    .number(detailNetC) // Detail Net (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(14, 7)
    .number(actualCashC) // Actual Cash (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(14, 8)
    .number(osC) // OS (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(14, 9)
    .number(chargeTotalC) // Charge Total (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(15, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(15, 2)
    .string('11p to 7a')
    .style(boldStyle)

  summaryWB.cell(15, 3)
    .number(detailCCardA) // Detail CCard (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(15, 4)
    .number(detailGCardA) // Detail GCard (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(15, 5)
    .number(detailCashA) // Detail Cash (11p-7a)
    .style(moneyStyle)

  detailNetA = (detailCCardA + detailGCardA + detailCashA)
  summaryWB.cell(15, 6)
    .number(detailNetA) // Detail Net (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(15, 7)
    .number(actualCashA) // Actual Cash (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(15, 8)
    .number(osA) // OS (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(15, 9)
    .number(chargeTotalA) // Total Charge (11p-7a)
    .style(moneyStyle)

  summaryWB.cell(17, 1)
    .string('TOTALS')
    .style(boldStyle)

  let totalDetailCCard = (detailCCardA + detailCCardB + detailCCardC)
  summaryWB.cell(17, 3)
    .number(totalDetailCCard) // Total Detail CCard
    .style(moneyStyle)

  let totalDetailGCard = (detailGCardA + detailGCardB + detailGCardC)
  summaryWB.cell(17, 4)
    .number(totalDetailGCard) // Total Detail GCard
    .style(moneyStyle)

  let totalDetailCash = (detailCashA + detailCashB + detailCashC)
  summaryWB.cell(17, 5)
    .number(totalDetailCash) // Total Detail Cash
    .style(moneyStyle)

  let totalDetailNet = (detailNetA + detailNetB + detailNetC)
  summaryWB.cell(17, 6)
    .number(totalDetailNet) // Total Detail Net
    .style(moneyStyle)

  let totalActualCash = (actualCashA + actualCashB + actualCashC)
  let totalActualCashExp = (totalCashA + totalCashB + totalCCardC)
  summaryWB.cell(17, 7)
    .number(totalActualCash) // Total Actual Cash
    .style(moneyStyle)

  let totalOS = (osA + osB + osC)
  summaryWB.cell(17, 8)
    .number(totalOS) // Total OS
    .style(moneyStyle)

  let totalChargeTotal = (chargeTotalA + chargeTotalB + chargeTotalC)
  let totalChargeTotalExp = (totalCCardA + totalCCardB + totalCCardC)
  summaryWB.cell(17, 9)
    .number(totalChargeTotal) // Total Charge Total
    .style(moneyStyle)

  if (!isFinal) {
    summaryWB.cell(17, 10)
      .number(totalChargeTotal - totalChargeTotalExp) // Total OS Charge
      .style(moneyStyle)
  }

  summaryWB.cell(17, 11)
    .string("<-- Over Credit/(Under Debit)")
    .style(boldStyle)

  if (isFinal) {
    summaryWB.cell(19, 1)
      .string('Vending Deposit')
      .style(boldStyle)

    summaryWB.cell(19, 4)
      .string('Revenue')
      .style(boldStyle)

    summaryWB.cell(19, 5)
      .string('Sales Tax')
      .style(boldStyle)

    summaryWB.cell(19, 7)
      .string('Facility/Sound Deposit')
      .style(boldStyle)

    summaryWB.cell(19, 7)
      .string('Facility/Sound Deposit')
      .style(boldStyle)

    summaryWB.cell(20, 3)
      .number(0)
      .style(moneyStyle)

    summaryWB.cell(20, 4)
      .formula('C20/1.07')
      .style(moneyStyle)

    summaryWB.cell(20, 5)
      .formula('C20-D20')
      .style(moneyStyle)

    summaryWB.cell(20, 7)
      .string('Sound System Reserve')
      .style(boldStyle)

    summaryWB.cell(20, 10)
      .string('Facility Rental')
      .style(boldStyle)

    summaryWB.cell(21, 7)
      .string('Total:')
      .style(boldStyle)

    summaryWB.cell(21, 8)
      .number(0)
      .style(moneyStyle)

    summaryWB.cell(21, 10)
      .string('Total:')
      .style(boldStyle)

    summaryWB.cell(21, 11)
      .number(0)
      .style(moneyStyle)
  }


  let writeSaveDir = systemData.fileSaveSystemDir + '/' + currentDateFile + '-' + currentTimeFile + '-' + reportType + '.xlsx'
  wb.write(writeSaveDir)
  notificationSystem('success', "Report written and saved to '" + writeSaveDir + "'")
}

async function updateMemberNotes(memberID){
  let currMemberInfo = await getMemberInfo(memberID)
  let currNotes = currMemberInfo['notes']
  const docRef = doc(db, "members", memberID);
  if (!Array.isArray(currNotes)) {
    await updateDoc(docRef, {
      notes: Array('(old system): ' + currNotes),
    })
    return true
  }else{
    return true
  }
}

async function editMembership(memberInfo){
  notificationSystem('warning', 'Updating member...')
  const dateStr = memberInfo[5];
  const date = new Date(dateStr);
  const timestampInMs = date.getTime();
  const unixTimestamp = Math.floor(date.getTime() / 1000);
  const docRef = doc(db, "members", memberInfo[0]);
  await updateMemberNotes(memberInfo[0])
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let stringStarter = getDisplayName() + ' [' + theStringTime + ']: '

  if (!memberInfo[4]) {
    await updateDoc(docRef, {
      fname: memberInfo[1],
      lname: memberInfo[2],
      dob: memberInfo[3],
      idnum: memberInfo[6],
      idstate: memberInfo[7],
      notes: arrayUnion(stringStarter + memberInfo[8]),
      waiver_status: memberInfo[9],
      name: memberInfo[1] + ' ' + memberInfo[2],
      email: memberInfo[10]
    });
  } else {
    await updateDoc(docRef, {
      fname: memberInfo[1],
      lname: memberInfo[2],
      dob: memberInfo[3],
      membership_type: memberInfo[4],
      id_expiration: unixTimestamp,
      idnum: memberInfo[6],
      idstate: memberInfo[7],
      notes: arrayUnion(stringStarter + memberInfo[8]),
      waiver_status: memberInfo[9],
      name: memberInfo[1] + ' ' + memberInfo[2],
      email: memberInfo[10]
    });
  }
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
  let theRentalLength = false
  if (productInfo[12]) {
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
  if (productInfo[11]) {
    let theMultiple
    if (productInfo[18] == 'hour') {
      theMultiple = 3600
    } else if (productInfo[18] == 'day') {
      theMultiple = 86400
    } else if (productInfo[18] == 'week') {
      theMultiple = 604800
    } else if (productInfo[18] == 'month') {
      theMultiple = 2.628e+6
    } else if (productInfo[18] == 'year') {
      theMultiple = 3.154e+7
    }
    theRentalLength = productInfo[17] * theMultiple
  }

  const docRef = doc(db, "products", productInfo[0]);
  await updateDoc(docRef, {
    cat: productInfo[1],
    name: productInfo[2],
    price: productInfo[3],
    invWarning: productInfo[4],
    desc: productInfo[5],
    inventory: productInfo[6],
    favorite: productInfo[7],
    taxable: productInfo[8],
    active: productInfo[9],
    core: productInfo[10],
    rental: productInfo[11],
    membership: productInfo[12],
    membershipLength: theMembershipLength,
    membershipLengthRaw: productInfo[13],
    membershipLengthType: productInfo[14],
    rentalLength: theRentalLength,
    rentalLengthRaw: productInfo[17],
    rentalLengthType: productInfo[18],
    inventoryPar: productInfo[15],
    barcode: productInfo[16]
  });
  notificationSystem('success', 'Product Edited!')
//  goProducts()
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
  const q1 = query(collection(db, "members"), where("id_number", "==", systemData.lid + 1), where('access', '==', getSystemAccess()));
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
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let stringStarter = getDisplayName() + ' [' + theStringTime + ']: '
  console.log(stringStarter);

  let theProductInfo
  productsData.forEach(product => {
    if (product[1].name == memberInfo[3]) {
      theProductInfo = product
    }
  });

  idExpiration = theCurrentTime + theProductInfo[1].membershipLength

  const q1 = query(collection(db, "members"), where("id_number", "==", systemData.lid + 1), where('access', '==', getSystemAccess()));
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
    const q2 = query(collection(db, "members"), where("name", "==", memberInfo[0] + " " + memberInfo[1]), where("dob", "==", memberInfo[2]), where('idnum', "==", memberInfo[6]), where('access', '==', getSystemAccess()));
    const querySnapshot2 = await getDocs(q2);
    querySnapshot2.forEach( async (doc) => {
      updateMembership(doc.id, doc.data(), memberInfo);
      updateOrderCustomerID(pendingOrderID, doc.id)
      update = true;
    });
  }
  if (!update) {
    const docRef = await addDoc(collection(db, "members"), {
      access: getSystemAccess(),
      notes: Array(stringStarter + memberInfo[4]),
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

async function gatherUserByID(theUserID) {
  usersData.forEach(user => {
    if (user[0] == theUserID) {
      return user[1]
    }
  });
}

async function gatherUserNameByID(theUserID) {
  usersData.forEach(user => {
    if (user[0] == theUserID) {
      return user[1].displayName
    }
  });
}

async function gatherAllUsers(){
  usersData.forEach(user => {
    theClient.send('recieve-users', Array(user[0], user[1]))    
  });
}

async function gatherMemberHistory(memberID){
  const q1 = query(collection(db, "activity"), where("memberID", "==", memberID), where('access', '==', getSystemAccess()));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    theClient.send('member-history-request-return', Array(doc.id, doc.data()))
  });
}

async function gatherOrderHistory(memberID){
  const q1 = query(collection(db, "orders"), where("customerID", "==", memberID), where('access', '==', getSystemAccess()));
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

  const q = query(collection(db, "members"), orderBy("creation_time"), where('access', '==', getSystemAccess()));
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
  const q = query(collection(db, "activity"), where("active", "==", false), where("timeOut", ">=", theCurrentTimeP24Date), where('access', '==', getSystemAccess()));

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
  const q = query(collection(db, "orders"), where("timestamp", ">=", theCurrentTimeP24Date), where('access', '==', getSystemAccess()));
  const querySnapshot = await getDocs(q)
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
  const q = query(collection(db, "activity"), where("active", "==", true), where('access', '==', getSystemAccess()));
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
  const q = query(collection(db, "categories"), where('access', '==', getSystemAccess()));
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
  const q = query(collection(db, "products"), orderBy('name', 'asc'), where('access', '==', getSystemAccess()));
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
  const q = query(collection(db, "discounts"), where('access', '==', getSystemAccess()));
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

async function startGatherAllUsers() {
  if (startGatherAllUsersA) {
    return
  }
  startGatherAllUsersA = true;
  const q = query(collection(db, "users"), where('access', '==', getSystemAccess()));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        if (!users.includes(change.doc.id)) {
          users.push(change.doc.id);
          usersData.push(Array(change.doc.id, change.doc.data()));
        }
      }
      if (change.type === "modified") {
        if (users.includes(change.doc.id)) {
          usersData.forEach(async (item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
            }
          });
        }
      }
      if (change.type === "removed") {
        if (users.includes(change.doc.id)) {
          usersData.forEach((item, i) => {
            if (item[0] == change.doc.id) {
              item[1] = change.doc.data();
              usersData.splice(i, 1)
            }
          });
        }
      }
    });
  })
}

async function startGatherAllOrders(){
  if (startGatherAllOrdersA) {
    return
  }
  startGatherAllOrdersA = true;
  const q = query(collection(db, "orders"), where('access', '==', getSystemAccess()));
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

async function attemptLogin(details){
  notificationSystem('warning', 'Logging in...')
  loginCreds = details;
  signInWithEmailAndPassword(auth, details[0], details[1])
  .then(async(userCredential) => {
    user = userCredential.user;
    await getUserData()
    if (!getSystemAccess()) {
      mainWin.loadFile(path.join(__dirname, 'access.html'));
    } else {
      mainWin.loadFile(path.join(__dirname, 'index.html'));
      user = userCredential.user;
      setTimeout(function () { startLoading() }, 1000);
    }      
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    console.log(error);
    notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
  });
}

async function addAccess(code){
  notificationSystem('warning', 'Checking access code...')
  updateDoc(doc(db, "users", getUID()), {
    access: code,
  }); 

  setTimeout(async () => {
    const docRef = doc(db, "system", code);
    const docSnap = await getDoc(docRef).catch((error) => {
      console.log(error);
      if (error.code == "permission-denied") {
        notificationSystem('danger', 'Access code NOT valid!')
        updateDoc(doc(db, "users", getUID()), {
          access: "",
        });        
      }
    })

    if (docSnap.exists()) {
      loadAuth()
      setTimeout(() => {
        notificationSystem('success', 'Access code has been saved to your account!')        
      }, 1000);
    }
  }, 2000);
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
              access: getSystemAccess(),
              rank: accountInfo[2],
              displayName: accountInfo[1],
              email: accountInfo[0],
            });
            notificationSystem('success', "Account created! New employee must check their email to 'reset' their password.")
            signInWithEmailAndPassword(auth, loginCreds[0], loginCreds[1])
            .then((userCredential) => {
              user = userCredential.user;
              getUserData()
              getSystemData();              
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
  totalLoadingProccesses = 10 // CHANGE ME

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading user data...'))
  let theUserData = await getUserData();
  if (!theUserData) {
    return
  }
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading system data...'))
  await getSystemData();
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

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading users...'))
  await startGatherAllUsers();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading quickbooks...'))
  await quickBooksLogin();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Finished loading!'))
  goHome(true);
  await updateTLID();
}

async function getSystemData(){
  const docRef = doc(db, "system", userData.access);
  const docSnap = await getDoc(docRef).catch((error) => {
    console.log(error);
    if (error.code == "permission-denied") {
      notificationSystem('danger', 'Access code NOT valid!')
      updateDoc(doc(db, "users", getUID()), {
        access: "",
      });
      setTimeout(() => {
        userLogout()
      }, 2000);
    }
  });
  let userAllowed = false
  if (userData) {
    userAllowed = canUser("permissionEditSystemSettings");    
  }

  if (docSnap.exists()) {
    systemData = docSnap.data();
    systemData.fileSaveSystemDir = null
    let userAllowed = canUser("permissionEditSystemSettings");
    let fileSel = false

    if (!Array.isArray(systemData.fileSaveSystem)) {
      systemData.fileSaveSystemDir = systemData.fileSaveSystem
      fileSel = true
    } else {
      systemData.fileSaveSystem.forEach(theDir => {
        if (fs.existsSync(theDir) && !fileSel) {
          fileSel = true
          systemData.fileSaveSystemDir = theDir
        }
      });
    }

    if (!fileSel && userAllowed) {
      updateFileDir()
    } else if (!fileSel) {
      setTimeout(() => {
        notificationSystem('warning', 'There is no directory saved for your report storage. Please contact a manager to address this ASAP!')
        let theMsg = 'There is currently no directory saved for you report storage. Please login to the system on the PC named ' + theHostName + ', and select a directory where you want the reports to save when promoted to do so.'
        createMail(systemData.invWarnEMail, "Report save error!", theMsg, theMsg)
      }, 5000);
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
      const docRef = doc(db, "system", userData.access);
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
  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    fileSaveSystem: theDirsArray
  });
  await getSystemData()
  goAccount()
})

async function updateLID(){
  const docRef = doc(db, "system", userData.access);
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

ipcMain.on('app_version', (event) => {
  theClient = event.sender
  theClient.send('app_version', { version: app.getVersion() });
});

autoUpdater.on('checking-for-update', () => {
  notificationSystem('primary', 'Checking for new updates...')
  theClient.send('update_available');
});

autoUpdater.on('update-available', () => {
  notificationSystem('warning', 'A new update is available. Downloading now...')
  theClient.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  notificationSystem('success', 'Update Downloaded. It will be installed on restart.')
  theClient.send('update_downloaded');
});

autoUpdater.on('update-not-available', () => {
  notificationSystem('success', 'No new updates. You have the latest version!')
})

// IPCMain's

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

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

ipcMain.on('account-access', (event, arg) => {
  theClient = event.sender;
  addAccess(arg)
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
  goOrder()
  createOrder(Array(false, arg[3], arg[0] + ' ' + arg[1]), 'membership', arg)
})

ipcMain.on('membership-update', async (event, arg) => {
  theClient = event.sender;
  if (arg[11]) {
    goOrder()
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
  theClient.send('recieve-account', Array(displayName, rank, systemData, oauthClient.isAccessTokenValid()))
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
    permissionWaiveProducts: arg[7],
    permissionEditCoreProducts: arg[8],
    permissionEditSystemSettings: arg[9],
    permissionEditRegisters: arg[10]
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
  goOrder()
  createOrder(arg, 'activity', arg)
})

ipcMain.on('activity-renew', (event, arg) => {
  theClient = event.sender;
  goOrder()
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
  createProduct(arg[0], arg[1], arg[2], arg[3], arg[4], arg[5], arg[6], arg[7], arg[8], arg[9], arg[10], arg[11], arg[12], arg[13], arg[14], arg[15], arg[16], arg[17])
})

ipcMain.on('gather-products-order', (event, arg) => {
  theClient = event.sender;
  displayAllProductsOrder()
  setTimeout(() => {
    if (orderSuspended) {
      theClient.send('order-suspended')
    }
  }, 1000);
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

ipcMain.on('complete-rental-info-order', (event, arg) => {
  theClient = event.sender;
  theLockerRoomInput = arg[0]
  theLockerRoomInput2 = arg[1]
})

ipcMain.on('suspend-order', (event, arg) => {
  theClient = event.sender;
  suspendOrder()
})

ipcMain.on('add-to-order', (event, arg) => {
  theClient = event.sender;

  if (arg[2]) {
    theLockerRoomInput = arg[2]
    theLockerRoomInput2 = arg[3]
  }
  productsData.forEach(product => {
    if ((product[0] == arg[1][0]) && (!product[1].rental)) {
      addToOrder(arg[0], arg[1][0])      
    } else if ((product[0] == arg[1][0]) && (product[1].rental)) {
      if (!arg[0] || !arg[0][1]) {
        pendingOrders.unshift(Array(0, 'activity', Array(0, product[1].name, theLockerRoomInput, theLockerRoomInput2, false, false)))
      }else{
        pendingOrders.unshift(Array(arg[0], 'activity', Array(arg[0][2], product[1].name, theLockerRoomInput, theLockerRoomInput2, false, false)))
      }
    }
  });
})

ipcMain.on('resume-order', (event, arg) => {
  theClient = event.sender;
  orderSuspended = false
  resumeOrder()
})

ipcMain.on('member-create-order', (event, arg) => {
  theClient = event.sender;
  goOrder()
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
    const docRef = doc(db, "system", userData.access);
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
    const docRef = doc(db, "system", userData.access);
    await updateDoc(docRef, {
      renewTime: arg
    });
    await getSystemData()
    goHome()      
  }
})

ipcMain.on('edit-reciept', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (userAllowed) {
    const docRef = doc(db, "system", userData.access);
    await updateDoc(docRef, {
      reciept: arg
    });
    await getSystemData()
    goHome()      
  }
})

ipcMain.on('edit-register-reciept', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (userAllowed) {
    const docRef = doc(db, "system", userData.access);
    await updateDoc(docRef, {
      registerReciept: arg
    });
    await getSystemData()
    goHome()      
  }
})

ipcMain.on('quick-sale', (event, arg) => {
  theClient = event.sender;
  goOrder()
  createOrder(Array(arg, false, false), 'order', false)
})

ipcMain.on('generate-report-now', (event, arg) => {
  theClient = event.sender;
  startRegisterReport(false, false)
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
  theClient = event.sender;
  recieptWin.close()
  createRecieptScreen(false)
})

ipcMain.on('reciept-choice-email', (event, arg) => {
  theClient = event.sender;
  recieptWin.close()
  emailReciept(arg)
})

ipcMain.on('reciept-choice-pande', (event, arg) => {
  theClient = event.sender;
  recieptWin.close()
  createRecieptScreen(false)
  emailReciept(arg)
})

ipcMain.on('reciept-choice-close', (event, arg) => {
  theClient = event.sender;
  recieptWin.close()
})

const oauthClient = new OAuthClient({
  clientId: 'ABJqZxMnj4SwV0T1cu7GPf2WOzGjcjQW44wzKG8OtlVJnxg1Bs',
  clientSecret: 'uAre4dCXtd2Fwbt6CR93XGI3WceTUWZSYoye9tEH',
  environment: 'sandbox',
  redirectUri: 'http://clubentertainmentrms.com/resources/quickbooks/',
});

function quickBooksConnect() {
  // AuthorizationUri
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'testState',
  }); // can be an array of multiple scopes ex : {scope:[OAuthClient.scopes.Accounting,OAuthClient.scopes.OpenId]}
  shell.openExternal(authUri)
}

function quickBooksCheckLogin(){
  return oauthClient.isAccessTokenValid()
}

const isValidUrl = urlString => {
  var urlPattern = new RegExp('^(https?:\\/\\/)?' + // validate protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // validate domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // validate OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // validate port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // validate query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // validate fragment locator
  return !!urlPattern.test(urlString);
}

async function quickBooksLogin(parseRedirect) {
  let authToken
  if (systemData.quickBooksToken) {
    authToken = systemData.quickBooksToken
  }
  if (isValidUrl(parseRedirect)) {
    oauthClient.createToken(parseRedirect)
      .then(async function (authResponse) {
        authToken = authResponse.getJson()
      })
      .catch(function (e) {
        notificationSystem('danger', 'Something went wrong. (' + e.originalMessage + ')')
        console.log("The error message is :" + e.originalMessage);
        console.log(e.intuit_tid);
        return false
    });
  }

  oauthClient.setToken(authToken);
  if (oauthClient.isAccessTokenValid()) {
    const docRef = doc(db, "system", getSystemAccess());
    await updateDoc(docRef, {
      access: getSystemAccess(),
      quickBooksToken: authToken
    }).catch((error) => {
      console.log(error);
      if (error.code == "permission-denied") {
        notificationSystem('danger', 'Access code NOT valid!')
        updateDoc(doc(db, "users", getUID()), {
          access: "",
        });
      }
    });
    return true
  } else {
    console.log('Something went wrong - Quickbooks is not connected.');
    return false
  }
}

function quickbooksGetAllProducts(){
  console.log('HERE: ');
  console.log(oauthClient.isAccessTokenValid());
  oauthClient
    .makeApiCall({
      url: 'https://sandbox-quickbooks.api.intuit.com/v3/company/4620816365354134710/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: "select * from Item",
    })
    .then(function (response) {
      console.log(response);
      theClient.send('quickbooks-test-test', response)
    })
    .catch(function (e) {
      console.log('The error is ' + JSON.stringify(e));
    });
}

function quickBooksTest() {
  let body = {
    "Line": [
      {
        "DetailType": "SalesItemLineDetail",
        "Amount": 123.0,
        "SalesItemLineDetail": {
          "ItemRef": {
            "name": "Membership",
            "value": "1"
          }
        }
      },
      {
        "DetailType": "SalesItemLineDetail",
        "Amount": 123.0,
        "SalesItemLineDetail": {
          "ItemRef": {
            "name": "Membership",
            "value": "1"
          }
        }
      },
      {
        "DetailType": "SalesItemLineDetail",
        "Amount": 123.0,
        "SalesItemLineDetail": {
          "ItemRef": {
            "name": "Membership",
            "value": "1"
          }
        }
      },
      {
        "DetailType": "SalesItemLineDetail",
        "Amount": 100.0,
        "SalesItemLineDetail": {
          "ItemRef": {
            "name": "Product",
            "value": "1"
          }
        }
      }
    ],
    "CustomerRef": {
      "value": "1"
    }
  }

  oauthClient
    .makeApiCall({
      url: 'https://sandbox-quickbooks.api.intuit.com/v3/company/4620816365354134710/invoice?minorversion=69',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    .then(function (response) {
      console.log(response);
      console.log('\n\n');
      console.log(arg['json']['Invoice']);
      console.log('\n\n');
      theClient.send('quickbooks-test-test', response)
    })
    .catch(function (e) {
      console.log('The error is ' + JSON.stringify(e));
    });
}

ipcMain.on('quickbooks-test', (event, arg) => {
//  quickBooksTest()
  quickbooksGetAllProducts()
})

ipcMain.on('quickbooks-connect', (event, arg) => {
  quickBooksConnect()
})

ipcMain.on('quickbooks-login', (event, arg) => {
  quickBooksLogin(arg)
})

ipcMain.on('request-update', (event, arg) => {
  theClient = event.sender;
  autoUpdater.checkForUpdatesAndNotify();
})

ipcMain.on('github-link', (event, arg) => {
  theClient = event.sender;
  shell.openExternal('https://github.com/matthewstriks/cerms/issues')
})
