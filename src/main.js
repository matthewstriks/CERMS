const devMode = false;
const { app, BrowserWindow, ipcMain, dialog, webContents, shell, systemPreferences } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const xl = require('excel4node');
const { firebaseConfig, quickbooksConfig } = require('./assets/firebase-config.js');
const { initializeApp } = require("firebase/app");
const { getAuth, updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updatePassword, updateEmail, sendEmailVerification } = require("firebase/auth");
const { initializeFirestore, CACHE_SIZE_UNLIMITED, collection, onSnapshot, query, where, getFirestore, doc, deleteDoc, setDoc, getDoc, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp, orderBy, limit, FieldValue, arrayUnion, increment, arrayRemove } = require("firebase/firestore");
const { getStorage, ref, uploadString, getDownloadURL, deleteObject } = require("firebase/storage");
const { log } = require('console');
const delay = require('delay');
const { address } = require('address');
const os = require('os');
const { getSystemMemoryInfo } = require('process');
const theHostName = os.hostname();
const OAuthClient = require('intuit-oauth');
const { compareAsc, format } = require("date-fns");
//const QuickBooks = require('node-quickbooks')

/*
  getDownloadURL(ref(storage, 'product-images/286x180.svg'))
  .then((url) => {
    console.log(url);
    })
  .catch((error) => {
    console.log(error);
  });
*/

function initializeAppFunct(){
  firebaseApp = initializeApp(firebaseConfig);
}

const oauthClient = new OAuthClient(quickbooksConfig);

const startInitApp = initializeAppFunct();
const firestoreDb = initializeFirestore(firebaseApp, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED
});
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
let uploadFileWin;
let swfWin;
let recieptWin;
let theClient;
let theClient2;
let theProductImgID;
let theMemberFileID;
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
let darkMode = false
let quickbooksIsConnected = false

let pendingOrders = Array()
let pendingOrderID;
let lastMemberCreated;
let lastMemberName;
let lastMemberID;
let lastMemberDOB; 
let lastMemberIDState; 
let lastMemberIDNum;
let orderSuspended = false
let theLockerRoomInput
let theLockerRoomInput2
let withProductsTxtTrial

let regStatus = false;
let regStatusID = false;

let importMembershipsMode = false
let debugMode = false

let notificationsData = Array()

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function loadAuth(){
  mainWin.unmaximize()
  mainWin.loadFile(path.join(__dirname, 'login.html'));
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

function isQuickbooksConnected(){
  return oauthClient.isAccessTokenValid()
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

function getLastRegister(){
  return userData.lastRegister;
}

function notificationSystem(notificationType, notificationMsg){
  addLog('notification', 'New ' + notificationType + ' notification: ' + notificationMsg)

  let theNotificationID = notificationsData.length + 1
  let keepMsg = true
  if (notificationMsg == 'Logging in...') {
    keepMsg = false
  }
  let toAdd = Array(theNotificationID, notificationType, notificationMsg, keepMsg)
  notificationsData.push(toAdd)
  let theNotSecs = 10 * 1000
  if (userData && userData.notificationSecs) {
    theNotSecs = userData.notificationSecs * 1000
  }  
  theClient.send('notification-system', Array(notificationType, notificationMsg, false, theNotificationID))
  setTimeout(() => {
    theClient.send('notification-system-remove', theNotificationID)
    notificationsData.forEach(notification => {
      if (notification[0] == theNotificationID) {
        notification[3] = false
      }
    });
  }, theNotSecs);
}

function getNotifications(){
  let theNotSecs = 10
  if (userData && userData.notificationSecs) {
    theNotSecs = userData.notificationSecs
  }  
  notificationsData.forEach(notification => {
    if (notification[3]) {
      theClient.send('notification-system', Array(notification[1], notification[2], theNotSecs, notification[0]))
    }    
  });
}

function removeNotification(theNotificationID){
  notificationsData.forEach(notification => {
    if (notification[0] == theNotificationID) {
      notification[3] = false
    }
  });
}

async function addLog(type, message){
  if (debugMode) {
    console.log('Logging: ' + type + '(' + message + ')');
    const docRef = await addDoc(collection(db, "logs"), {
      access: getSystemAccess(),
      type: type,
      message: message,
      timestamp: serverTimestamp(),
      user: getUID()
    });

  }
}

async function getMemberInfo(memberID){
  if ((memberID == -1) || (memberID == 0) || (Array.isArray(memberID))) {
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
  addLog('auth', 'Password reset requested for ' + theEmail)

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
  addLog('membership', 'Updating Membership ' + memberID)
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
  if (!canUser('permissionEditDNAAdd')) {
    notificationSystem('warning', 'You do not have permisison to add someone to the DNA list.')
    return
  }

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
  let stringEnd = 'Added to the DNA List. '
  let theNotes = memberInfo[1]
  if (theNotes) {
    stringEnd = stringEnd + '(' + theNotes + ')'
  }
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    dna: true,
    notes: arrayUnion(stringStarter + stringEnd),
  });
  notificationSystem('success', 'Member added to the DNA list')
}

async function memberUNDNA(memberInfo){
  if (!canUser('permissionEditDNARemove')) {
    notificationSystem('warning', 'You do not have permisison to remove someone from the DNA list.')
    return
  }
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
  let stringEnd = 'Removed from the DNA List. '
  let theNotes = memberInfo[1]
  if (theNotes) {
    stringEnd = stringEnd + '(' + theNotes + ')'
  }
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    dna: false,
    notes: arrayUnion(stringStarter + stringEnd),
  });
  notificationSystem('success', 'Member removed from the DNA list')
}

async function memberTag(memberInfo){
  if (!canUser('permissionEditTagAdd')) {
    notificationSystem('warning', 'You do not have permisison to add someone to the Tag list.')
    return
  }

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
  let stringEnd = 'Added to the Tag List. '
  let theNotes = memberInfo[1]
  if (theNotes) {
    stringEnd = stringEnd + '(' + theNotes + ')'
  }
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    tag: true,
    notes: arrayUnion(stringStarter + stringEnd),
  });
  notificationSystem('success', 'Member added to the Tag list')
}

async function memberUNTag(memberInfo){
  if (!canUser('permissionEditTagRemove')) {
    notificationSystem('warning', 'You do not have permisison to remove someone from the Tag list.')
    return
  }
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
  let stringEnd = 'Removed from the Tag List. '
  let theNotes = memberInfo[1]
  if (theNotes) {
    stringEnd = stringEnd + '(' + theNotes + ')'
  }
  const docRef = doc(db, "members", memberInfo[0]);
  await updateDoc(docRef, {
    tag: false,
    notes: arrayUnion(stringStarter + stringEnd),
  });
  notificationSystem('success', 'Member removed from the Tag list')
}

async function renewActivity(memberInfo){
  notificationSystem('warning', 'Renewing time...')
  let theUserID = getUID();
  let theCurrentTime = memberInfo[1][4];
  let theCurrentTimeExp = memberInfo[1][5];
  let theTimeToAdd = 6 * 3600

  productsData.forEach(product => {
    if ((product[1].name == memberInfo[1][2]) && (product[1].rental) && (product[1].rentalLength)) {
      theTimeToAdd = product[1].rentalLength
    }
  });
  /*
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
  */

  if (systemData.includeExpireTimeRenew) {
    theTimeExpire = theCurrentTimeExp + theTimeToAdd;    
  } else {
    let timestamp = Date.now();
    timestampInSeconds = timestamp / 1000;
    theTimeExpire = timestampInSeconds + theTimeToAdd;    
  }

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

async function createProduct(proCat, proName, proPrice, proInvWarn, proDesc, proInv, proFavorite, proTaxable, proActive, proCore, proRental, proMembership, proMembershipLength, proMembershipLengthType, proInvPar, proBarcode, proRentalLength, proRentalLengthType, proRestricted, proRestrictedUsers, proPayout, proAskForPrice){
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

  if (Number(proPrice) > 0 && proAskForPrice) {
    proAskForPrice = false
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
    image: false,
    restricted: proRestricted,
    restrictedUsers: proRestrictedUsers,
    payout: proPayout,
    askforprice: proAskForPrice
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

async function voidOrder(orderNumber){
  if (!canUser('permissionEditVDTransactions')) {
    notificationSystem('warning', 'You do not have permission to do this!')
    return
  }
  await deleteDoc(doc(db, "orders", orderNumber));
  notificationSystem('success', 'Order #' + orderNumber + ' has been deleted.')
  theClient.send('history-request-remove', orderNumber)
}

async function createOrder(memberInfo, orderType, thePendingOrder){
  if (!regStatus) {
    setTimeout(() => {
      notificationSystem('warning', 'There is no register currently active. You must activate a register to create an order.')
      theClient.send('no-register-active')
    }, 1000);    
//    return
  }

  if (!orderSuspended) {
    pendingOrders = Array()
  }

  let pendingOrderType = orderType
  let pendingOrderInfo = thePendingOrder
  pendingOrders.unshift(Array(memberInfo, pendingOrderType, pendingOrderInfo))

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
        theClient.send('send-product-info', Array(item, memberInfo[2]))
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
      theClient.send('no-register-active')
    }, 1000);
//    return
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
          theClient.send('send-product-info', Array(item, porder[0][2]))
        }
      });
    }, 1000)
  });
}

async function viewOrderReciept(theOrderNumber){
  let p2 = path.join(app.getPath('userData'), '.', 'last-reciept.html');
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

//TODO: Create getTimestampString(date(date), time(bool)) function to clean some of the dates/timestamps up

async function registerReciept(registerID, logoutTF){
  let theTimestamp = new Date(Math.floor(Date.now()))
  let theMonth = theTimestamp.getMonth() + 1
  let theDate = theTimestamp.getDate()
  let theFullYear = theTimestamp.getFullYear()
  let theHours = theTimestamp.getHours()
  let theMins = theTimestamp.getMinutes()
  let theSecs = theTimestamp.getSeconds()
  let theStringTime = theMonth + '/' + theDate + '/' + theFullYear + ' ' + theHours + ':' + theMins + ':' + theSecs
  let theDisplayName = await getDisplayName()
  let p2 = path.join(app.getPath('userData'), '.', 'last-reciept.html');

  const docRef = doc(db, "registers", registerID);
  const docSnap = await getDoc(docRef);
  let registerInfo = docSnap.data()


  let theDropsHTML = "<b>Drop Information</b><br><br>"
  docRef2 = query(collection(db, "drops"), where("registerID", "==", registerID), where('access', '==', getSystemAccess()));
  const docSnap2 = await getDocs(docRef2);
  docSnap2.forEach(async drop => {
    let dropData = drop.data()
    let theData = dropData.timestamp.toDate()
    let day = theData.getDate();
    let month = theData.getMonth() + 1;
    let year = theData.getFullYear();
    let hour = theData.getHours();
    let min = theData.getMinutes();
    let sec = theData.getSeconds();
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
    let currentTime = `${hour}:${min}:${sec} ${ampm}`;
    let theTimeStamp = currentDate + ' ' + currentTime
    theDropsHTML = theDropsHTML + "<b>Drop Timestamp:</b> " + theTimeStamp + "<br><b>Drop Amount:</b> $" + dropData.dropAmt + "<br><b>Payout Slip #/Amount:</b> " + dropData.dropPSN + "<b>/</b>$" + dropData.dropPSA + "<br><b>Credit Cards #/Amount:</b> " + dropData.dropCCardAmtRan + "<b>/</b>$" + dropData.dropCCardAmt + "<br><br>" 
  });

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
  let withInputDA
  let withInputPSN
  let withInputPSA
  let withInputCCRA
  let withInputCCRT

  let theReturnsHTML = ""
  formatter.format(Math.round((Number(registerInfo.starting) + Number.EPSILON) * 100) / 100)

  if (registerInfo.returns) {
    registerInfo.returns.forEach(async products => {
      let theInfo = await getProductInfo(products)
      theReturnsHTML = theReturnsHTML + "<br>" + theInfo.name
    });      
  }
  
  setTimeout(() => {
    if (theReturnsHTML == "") {
      theReturnsHTML = "None"
    }
    let p = path.join(__dirname, '.', '/assets/register-reciept.html');

    fs.readFile(p, 'utf8', async (err, theHTML) => {
      if (err) {
        console.error(err);
        return;
      }
      withBName = theHTML.replace('businessName', systemData.businessName)
      withBAdd = withBName.replace('businessAddress', systemData.businessAddress)
      withBAdd2 = withBAdd.replace('businessAddress2', systemData.businessAddress2)
      withBPN = withBAdd2.replace('businessPhone', systemData.businessPNum)
      withBEM = withBPN.replace('businessEMail', systemData.businessEMail)
      withDate = withBEM.replace('TheDate', theStringTime)
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
      withDrops = withInput1C.replace('InputDrops', theDropsHTML)
      withInputDA = withDrops.replace('InputDropAmtDrop', registerInfo.drop)
      withInputPSNDrop = withInputDA.replace('InputPayoutPSNDrop', registerInfo.dropPSN)
      withInputPSADrop = withInputPSNDrop.replace('InputPSADrop', registerInfo.dropPSA)
      withInputCCRADrop = withInputPSADrop.replace('InputCCardRanAmtDrop', registerInfo.dropCCardAmtRan)
      withInputCCRTDrop = withInputCCRADrop.replace('InputCCardTotalAmtDrop', registerInfo.dropCCardAmt)
      withInputPSN = withInputCCRTDrop.replace('InputPayoutPSN', registerInfo.PSN)
      withInputPSA = withInputPSN.replace('InputPSA', registerInfo.PSA)
      withInputCCRA = withInputPSA.replace('InputCCardRanAmt', registerInfo.CCardAmtRan)
      withInputCCRT = withInputCCRA.replace('InputCCardTotalAmt', registerInfo.ccard)
      withReturns = withInputCCRT.replace('TheReturns', theReturnsHTML)
      withTotal = withReturns.replace('TheTotal', registerInfo.ending)
      withStarting = withTotal.replace('TheExpTotal', Math.round(((registerInfo.starting) + Number.EPSILON) * 100) / 100)
      withDiff = withStarting.replace('TheDifference', Math.round(((registerInfo.ending - registerInfo.starting) + Number.EPSILON) * 100) / 100)
      withChargeTotal = withDiff.replace('TheTotalCharge', formatter.format(Math.round((Number(registerInfo.ccard) + Number.EPSILON) * 100) / 100))

      fs.writeFile(p2, withChargeTotal, err => {
        if (err) {
          console.error(err);
        }
        createRecieptScreen(false, logoutTF)
      });

      await updateDoc(docRef, {
        reciept: withChargeTotal
      });    
    })
  }, 1000);
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
  let p2 = path.join(app.getPath('userData'), '.', 'last-reciept.html')

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


  let p = path.join(__dirname, '.', '/assets/reciept.html');

  fs.readFile(p, 'utf8', (err, theHTML) => {
    if (err) {
      console.error(err);
      return;
    }
    withBName = theHTML.replace('businessName', systemData.businessName)
    withBAdd = withBName.replace('businessAddress', systemData.businessAddress)
    withBAdd2 = withBAdd.replace('businessAddress2', systemData.businessAddress2)
    withBPN = withBAdd2.replace('businessPhone', systemData.businessPNum)
    withBEM = withBPN.replace('businessEMail', systemData.businessEMail)

    withDate = withBEM.replace('TheDate', theStringTime)
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

    withProductsTxt = withProductsTxtTrial

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
            fs.writeFile(p2, withDiscounts, err => {
              if (err) {
                console.error(err);
              }
            });
            if (recieptStyle == 1) {
              createRecieptScreen(false)
            } else if (recieptStyle == 2) {
              createMail(theEMail, 'Reciept!', withDiscounts, withDiscounts)
            } else if (recieptStyle > 2) {
              createRecieptScreen(false)
              createMail(theEMail, 'Reciept!', withDiscounts, withDiscounts)
            }              
          }
        })
      }
    });
  });

}

async function completeOrder(orderInfo){
  if (!regStatus) {
    setTimeout(() => {
      notificationSystem('warning', 'There is no register currently active. You must activate a register to create an order.')
      theClient.send('no-register-active')
    }, 1000);
    return
  }
  let theTimestamp = new Date(Math.floor(Date.now() / 1000))
  let theCustomerID = orderInfo[0]
  if (!theCustomerID) {
    theCustomerID = 0
  }

  if (orderInfo[2] && (orderInfo[2][0] != 0) && (orderInfo[2][0] != 'return')) {
    const discountRef = doc(db, "discounts", orderInfo[2][0]);

    await updateDoc(discountRef, {
      used: increment(1)
    });
  }
  let registerInfo = await getActiveRegister()
  let discountsInformation = orderInfo[2]
  let isReturn = false
  if (orderInfo[2][0] == 'return') {
    isReturn = true
    discountsInformation = 'return'
    let registerRef = doc(db, "registers", regStatusID)
    let theReturns = registerInfo.returns || Array()
    orderInfo[1].forEach(products => {
      theReturns.push(products)       
    });
    await updateDoc(registerRef, {
      returns: theReturns
    })
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
    discounts: discountsInformation,
    total: orderInfo[3],
    paymentMethod: orderInfo[4],
    cashier: getUID(),
    timestamp: serverTimestamp(),
    shift: theShift,
    return: isReturn
  });

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
  let userAllowed = canUser("permissionDeleteMembers");
  if (userAllowed) {
    await deleteDoc(doc(db, "members", memberInfo));
    docRef = query(collection(db, "activity"), where("memberID", "==", memberInfo), where('access', '==', getSystemAccess()));
    const docSnap = await getDocs(docRef);
    docSnap.forEach(async activity => {
      const activityRef = doc(db, 'activity', activity.id)
      await updateDoc(activityRef, {
        removed: true
      })
    });
  } else {
    notificationSystem('danger', 'You do not have permisison for this.')    
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

  theClient.send('register-shift-times-return', Array(systemData.shiftTimeA, systemData.shiftTimeB, systemData.shiftTimeC))
}

async function gatherAllRegisters(){
  const q = query(collection(db, "registers"), where("active", "==", true), where('uid', '!=', getUID()), where('access', '==', getSystemAccess()));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach(async (doc) => {
    theClient.send('register-all-request-return', Array(doc.id, doc.data(), Array(systemData.shiftTimeA, systemData.shiftTimeB, systemData.shiftTimeC)))    
  });
}

async function startRegister(registerInfo, redirect){
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

  theClient.send('register-started')

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
    gcard: 0,
    dropPSN: 0,
    dropPSA: 0,
    dropCCardAmtRan: 0,
    dropCCardAmt: 0,
    PSN: 0,
    PSA: 0,
    CCardAmtRan: 0,
  });

  if (redirect) {
    goRegister()    
  }
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
  registerReciept(registerInfo[0], false)
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
    PSN: registerInfo[12],
    PSA: registerInfo[13],
    active: false
  });

  const userRef = doc(db, "users", getUID());
  await updateDoc(userRef, {
    lastRegister: regStatusID,
  });

  getUserData()
  registerReciept(regStatusID, logoutTF)
  startRegisterReport(regStatusID, false)
  regStatus = false
  regStatusID = false
  regStatusShift = false
  goRegister()
  registerStatus()
}

async function updateRegisterSub(registerInfo, amount, total, drop) {
  //  // paymentMethod: credit card, gift card, cash

  let registerAmount = registerInfo.starting
  let cCardAmt = registerInfo.ccard
  let gCardAmt = registerInfo.gcard
  cCardAmt = (cCardAmt + amount[0])
  gCardAmt = (gCardAmt + amount[1])

  registerAmount = registerAmount + amount[2]

  let dropAmt = registerInfo.drop
  let dropPSNAmt = registerInfo.dropPSN
  let dropPSAAmt = registerInfo.dropPSA
  let dropCCardAmtRan = registerInfo.dropCCardAmtRan
  let dropCCardAmt = registerInfo.dropCCardAmt

  let paymentTotal = 0;
  if (!drop && total) {
    paymentTotal = paymentTotal + amount[0]
    paymentTotal = paymentTotal + amount[1]
    paymentTotal = paymentTotal + amount[2]

    if (paymentTotal > total[2]) {
      totalSub = (total[2] - paymentTotal)
      if (totalSub < 0) {
        registerAmount = registerAmount + totalSub
      }
    }    
  } else if (drop) {
    dropAmt = (dropAmt + Math.abs(amount[2]))
    dropPSNAmt = dropPSNAmt + drop[0]
    dropPSAAmt = dropPSAAmt + drop[1]
    dropCCardAmtRan = dropCCardAmtRan + drop[2]
    dropCCardAmt = dropCCardAmt + drop[3]

    //Number(dropPSN.value), Number(dropPSA.value), Number(dropCCardAmtRan.value), Number(dropCCardAmt.value)
  }
  const registerRef = doc(db, "registers", regStatusID);
  await updateDoc(registerRef, {
    starting: Number(registerAmount),
    gcard: Number(gCardAmt),
    ccard: Number(cCardAmt),
    drop: Number(dropAmt),
    dropPSN: Number(dropPSNAmt),
    dropPSA: Number(dropPSAAmt),
    dropCCardAmtRan: Number(dropCCardAmtRan),
    dropCCardAmt: Number(dropCCardAmt)
  });   
  if (drop) {
    goRegister()
    registerStatus()   
    notificationSystem('success', 'Money drop has been logged.') 
  }   
}

async function createMoneyDrop(registerInfo, dropInfo){
  if (!regStatus) {
    return
  }

  const docRef = await addDoc(collection(db, "drops"), {
    access: getSystemAccess(),
    registerID: regStatusID,
    timestamp: serverTimestamp(),
    user: getUID(),
    dropAmt: Number(dropInfo[0]),
    dinput100: dropInfo[1],
    dinput50: dropInfo[2],
    dinput20: dropInfo[3],
    dinput10: dropInfo[4],
    dinput5: dropInfo[5],
    dinput1: dropInfo[6],
    dinput25c: dropInfo[7],
    dinput10c: dropInfo[8],
    dinput5c: dropInfo[9],
    dinput1c: dropInfo[10],
    dropPSN: dropInfo[11],
    dropPSA: dropInfo[12],
    dropCCardAmtRan: dropInfo[13],
    dropCCardAmt: dropInfo[14]
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
  let endDates

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

  let payoutTotalsA = 0
  let payoutTotalsB = 0
  let payoutTotalsC = 0

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
  let tomDate = `${month}/${day + 1}/${year}`;
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
    endDates = new Date(registerInfo.timestampEnd['seconds'] * 1000)
    q1 = query(ordersRef, where("timestamp", ">", registerInfo.timestampStart), where("timestamp", "<", registerInfo.timestampEnd), where("cashier", "==", theCID), where("access", "==", getSystemAccess()));
  } else if (!registerID && isFinal) {
    reportType = 'Final'
    startDates = new Date(yesterDate + ' 07:00');
    endDates = new Date(currentDate + ' ' + currentTime);
    q1 = query(ordersRef, where("timestamp", ">", startDates), where("access", "==", getSystemAccess()));
  } else {
    reportType = 'Generated'
    startDates = new Date(currentDate + ' 07:00');
    endDates = new Date(currentDate + ' ' + currentTime);
    q1 = query(ordersRef, where("timestamp", ">", startDates), where("access", "==", getSystemAccess()));
  }

  const startDate = startDates;
  let day2 = startDate.getDate();
  let month2 = startDate.getMonth() + 1;
  let year2 = startDate.getFullYear();
  let hour2 = startDate.getHours();
  let min2 = startDate.getMinutes();
  let sec2 = startDate.getSeconds();
  let ampm2 = hour2 >= 12 ? 'pm' : 'am';

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

  const endDate = endDates;
  let day2E = endDate.getDate();
  let month2E = endDate.getMonth() + 1;
  let year2E = endDate.getFullYear();
  let hour2E = endDate.getHours();
  let min2E = endDate.getMinutes();
  let sec2E = endDate.getSeconds();
  let ampm2E = hour2E >= 12 ? 'pm' : 'am';

  if (day2E < 10) {
    day2E = '0' + day2E
  }

  if (month2E < 10) {
    month2E = '0' + month2E
  }

  if (min2E < 10) {
    min2E = '0' + min2E
  }

  if (sec2E < 10) {
    sec2E = '0' + sec2E
  }

  if (hour2E > 12) {
    hour2E = hour2E - 12
  }

  let endDateS = `${month2E}/${day2E}/${year2E}`;
  let endTime = `${hour2E}:${min2E}:${sec2E} ${ampm2E}`;

  let endDateStr = endDateS + ' ' + endTime

  let productsAndAmounts = Array()
  let discountsAndAmounts = Array()
  productsData.forEach((product, i) => {
    productsAndAmounts.push(Array(product[0], 0, false))
  });
  discountsData.forEach((discount, i) => {
    discountsAndAmounts.push(Array(discount[0], 0))
  });

  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    let orderInfo = doc.data()
    if (orderInfo.return) {
      return
    }
    orderInfo.products.forEach((products, i) => {
      productsAndAmounts.forEach((productsAA, i2) => {
        if (productsAA[0] == products) {
          productsData.forEach(proLoop => {
            if (products == proLoop[0] && proLoop[1].payout) {
              productsAA[2] = productsAA[2] + orderInfo.total[2]               
            }
          });

          productsAA[1] = productsAA[1] + 1
        }
      })
    })

    if (Array.isArray(orderInfo.discounts)) {
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
          } else if (product[1].payout) {
            if (orderInfo.shift == "A") {
              payoutTotalsA = payoutTotalsA + Number(orderInfo.total[2])
            } else if (orderInfo.shift == "B") {
              payoutTotalsB = payoutTotalsB + Number(orderInfo.total[2])
            } else if (orderInfo.shift == "C") {
              payoutTotalsC = payoutTotalsC + Number(orderInfo.total[2])
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

  if (systemData.hideNPPSwitch) {
    for (let index = 0; index < productsAndAmounts.length; index++) {
      const element = productsAndAmounts[index];
      if (element[1] == 0) {
        delete element[0]
        delete element[1]
      }
    }
  }


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

  var redStyle = wb.createStyle({
    font: {
      color: "#FF0800"
    }
  })

  let productDescLine = 16;
  let productNames = Array()

  productsAndAmounts.forEach(productsAA => {
    if (productsAA[0]) {
      productsData.forEach(products => {
        if (productsAA[0] == products[0]) {
          productNames.push(products[1].name)
          detailWB.cell(productDescLine, 2)
            .string(products[1].name);

          if (products[1].payout) {
            detailWB.cell(productDescLine, 2)
              .style(redStyle)
          }

          detailWB.cell(productDescLine, 3)
            .number(productsAA[1]);

          detailWB.cell(productDescLine, 4)
            .number(products[1].price * productsAA[1])
            .style(moneyStyle);

          if (productsAA[2]) {
            detailWB.cell(productDescLine, 4)
              .number(productsAA[2])
              .style(moneyStyle);            
          }
        }
      })
      productDescLine = productDescLine + 1
    }
  });
  productDescLine = productDescLine + 1

  const lengthArr = productNames.map(productNames => productNames.length)
  let maxWidth = Math.max(...lengthArr)
  if (maxWidth <= 0 || !maxWidth) {
    maxWidth = 11
  }
  detailWB.column(2).setWidth(maxWidth + 3)

  //      (Y, X)  
  detailWB.cell(1, 1)
    .string('CERMS ' + app.getVersion())
    .style(boldStyle)
    .style({ font: { size: 20 } })

  detailWB.cell(1, 10)
    .string('Deposit Start Date/Time')
    .style(boldStyle)

  detailWB.cell(2, 10)
    .string('Deposit End Date/Time')
    .style(boldStyle)

  detailWB.cell(1, 12)
    .string(startDateStr)

  detailWB.cell(2, 12)
    .string(endDateStr)

  detailWB.cell(1, 15)
    .string('Cashier: ')
    .style(boldStyle)

  detailWB.cell(1, 17)
    .string(cashName)

  detailWB.cell(1, 21)
    .string(registerID)

  detailWB.cell(2, 1)
    .string("Deposit Detail Worksheet")
    .style(boldStyle)

  detailWB.cell(2, 3)
    .string(startDateStr)

  detailWB.cell(3, 3)
    .string(systemData.shiftTimeB)
    .style(boldStyle)

  detailWB.cell(3, 5)
    .string(systemData.shiftTimeC)
    .style(boldStyle)

  detailWB.cell(3, 7)
    .string(systemData.shiftTimeA)
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
    .string("CERMS " + app.getVersion())
    .style(boldStyle)

  summaryWB.cell(1, 4)
    .string('Deposit Journal Worksheet')
    .style(boldStyle)

  summaryWB.cell(1, 7)
    .string('Deposit Start Date/Time')
    .style(boldStyle)

  summaryWB.cell(2, 7)
    .string('Deposit End Date/Time')
    .style(boldStyle)

  summaryWB.cell(1, 9)
    .string(startDateStr)

  summaryWB.cell(2, 9)
    .string(endDateStr)

  summaryWB.cell(1, 11)
    .string('Cashier: ')
    .style(boldStyle)

  summaryWB.cell(1, 13)
    .string(cashName)

  summaryWB.cell(1, 17)
    .string(registerID)
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
    .string("Payout")
    .style(boldStyle)

  summaryWB.cell(3, 11)
    .string("Days Gross")
    .style(boldStyle)

  summaryWB.cell(5, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(5, 2)
    .string(systemData.shiftTimeB)
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

  summaryWB.cell(5, 10)
    .number(payoutTotalsB) // Payout (7a-3p)
    .style(moneyStyle)

  let daysGrossB = (membershipTotalsB + lockerTotalsB + roomTotalsB + counterTxTotalsB + salesTxTotalsB + noCounterTxTotalsB + passThruTotalsB + payoutTotalsB)
  summaryWB.cell(5, 11)
    .number(daysGrossB) // Days Gross (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(6, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(6, 2)
    .string(systemData.shiftTimeC)
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

  summaryWB.cell(6, 10)
    .number(payoutTotalsC) // Payout (3p-11p)
    .style(moneyStyle)

  let daysGrossC = (membershipTotalsC + lockerTotalsC + roomTotalsC + counterTxTotalsC + salesTxTotalsC + noCounterTxTotalsC + passThruTotalsC + payoutTotalsC)
  summaryWB.cell(6, 11)
    .number(daysGrossC) // Days Gross (3p-11p)
    .style(moneyStyle)

  summaryWB.cell(7, 1)
    .string(startDateStr)
    .style(boldStyle)

  summaryWB.cell(7, 2)
    .string(systemData.shiftTimeA)
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

  summaryWB.cell(7, 10)
    .number(payoutTotalsA) // Payout (11p-7a)
    .style(moneyStyle)

  let daysGrossA = (membershipTotalsA + lockerTotalsA + roomTotalsA + counterTxTotalsA + salesTxTotalsA + noCounterTxTotalsA + passThruTotalsA + payoutTotalsA)
  summaryWB.cell(7, 11)
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
    .number((payoutTotalsA + payoutTotalsB + payoutTotalsC)) // Payout Totals
    .style(moneyStyle)

  summaryWB.cell(9, 11)
    .number((daysGrossA + daysGrossB + daysGrossC)) // Days Gross Totals
    .style(moneyStyle)
    .style(boldStyle)

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
    .string(systemData.shiftTimeB)
    .style(boldStyle)

  summaryWB.cell(13, 3)
    .number(detailCCardB) // Detail CCard (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 4)
    .number(detailGCardB) // Detail GCard (7a-3p)
    .style(moneyStyle)

  summaryWB.cell(13, 5)
    .number(Number(detailCashB)) // Detail Cash (7a-3p)
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
    .string(systemData.shiftTimeC)
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
    .string(systemData.shiftTimeA)
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
    }).catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(error);
      notificationSystem('danger', errorMessage + ' (' + errorCode + ') [updateMemberNotes]')
    });

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
      mname: memberInfo[12],
      lname: memberInfo[2],
      suffix: memberInfo[13],
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
      mname: memberInfo[12],
      lname: memberInfo[2],
      suffix: memberInfo[13],
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
    if (productInfo[14] == 'hour') {
      theMultiple = 3600
    } else if (productInfo[14] == 'day') {
      theMultiple = 86400
    } else if (productInfo[14] == 'week') {
      theMultiple = 604800
    } else if (productInfo[14] == 'month') {
      theMultiple = 2.628e+6
    } else if (productInfo[14] == 'year') {
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


  let proAskForPrice = productInfo[22]
  if (Number(productInfo[3]) > 0 && proAskForPrice) {
    proAskForPrice = false
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
    barcode: productInfo[16],
    restricted: productInfo[19],
    restrictedUsers: productInfo[20],
    payout: productInfo[21],
    askforprice: proAskForPrice
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

function getNewID(){
  return Math.floor(100000 + Math.random() * 900000);
}

async function createMembership(memberInfo){
  theClient.send('membership-pending')
  notificationSystem('warning', "Creating member...")
  let theNewID = getNewID()
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

  let theProductInfo
  productsData.forEach(product => {
    if (product[1].name == memberInfo[3]) {
      theProductInfo = product
    }
  });

  idExpiration = Number(theCurrentTime) + Number(theProductInfo[1].membershipLength)

  const q1 = query(collection(db, "members"), where("id_number", "==", theNewID), where('access', '==', getSystemAccess()));
  const querySnapshot1 = await getDocs(q1);
  querySnapshot1.forEach((doc) => {
    update = true;
    theClient.send('membership-pending-waiting-for-id')
    notificationSystem('warning', 'Creating member... (waiting for new ID)')
    getSystemData();
    setTimeout(function(){createMembership(memberInfo)}, 1000);
  });
  if (!update){
    const q2 = query(collection(db, "members"), where("dob", "==", memberInfo[2]), where('idnum', "==", memberInfo[6]), where('access', '==', getSystemAccess()));
    const querySnapshot2 = await getDocs(q2);
    querySnapshot2.forEach( async (doc) => {
      update = true;
      updateMembership(doc.id, doc.data(), memberInfo);
      updateOrderCustomerID(pendingOrderID, doc.id)
    });
  }
  if (!update && memberInfo[13]) {
    const q3 = query(collection(db, "members"), where("id_number", "==", memberInfo[13]), where('access', '==', getSystemAccess()));
    const querySnapshot3 = await getDocs(q3);
    querySnapshot3.forEach(async (doc) => {
      update = true;
      let theID = ""
      if (doc.id) {
        theID = "<a href='#' id='lastCreatedID' onclick='openMembership()' >" + doc.id + "</a>"
      }
      let theMsg = "This member already exists! ID: " + theID
      notificationSystem('warning', theMsg)
    });
  }

  if (!update) {
    let creationTime = serverTimestamp()
    let expireTime = idExpiration
    let idNumber = theNewID
    if (importMembershipsMode) {
      if (memberInfo[11]) {
        let dateStr = memberInfo[11];
        let date = new Date(dateStr);
        creationTime = Timestamp.fromDate(new Date(date))        
      }
      if (memberInfo[12]) {
        let dateStr2 = memberInfo[12];
        let date2 = new Date(dateStr2);
        let unixTimestamp2 = Math.floor(date2.getTime() / 1000);
        expireTime = unixTimestamp2        
      }
      if (memberInfo[13]) {
        idNumber = memberInfo[13]
      }
    }

    let theNotes = Array()
    if (memberInfo[4]) {
      theNotes = Array(stringStarter + memberInfo[4])      
    }

    let waiverStatus = false
    if (memberInfo[14]) {
      waiverStatus = memberInfo[14]
    }

    const docRef = await addDoc(collection(db, "members"), {
      access: getSystemAccess(),
      notes: theNotes,
      name: memberInfo[0] + " " + memberInfo[1],
      fname: memberInfo[0],
      lname: memberInfo[1],
      mname: memberInfo[9],
      suffix: memberInfo[10],
      dna: false,
      id_number: Number(idNumber),
      waiver_status: waiverStatus,
      id_expiration: expireTime,
      dob: memberInfo[2],
      creation_time: creationTime,
      membership_type: memberInfo[3],
      checkedIn: false,
      idnum: memberInfo[6],
      idstate: memberInfo[7],
      email: memberInfo[8]
    });
    theClient.send('membership-success', docRef.id)
    let theID = 'Unknown ID'
    if (docRef.id) {
      theID = "<a href='#' id='lastCreatedID' onclick='openMembership()' >" + docRef.id + "</a>"
    }
    let theMsg = "Membership created! ID: " + theID
    notificationSystem('success', theMsg)
//    let theMembersData = await getMemberInfo(docRef.id);
//    theClient.send('membership-request-return', Array(docRef.id, theMembersData))
    if (!importMembershipsMode) {
      updateOrderCustomerID(pendingOrderID, docRef.id)      
    }
    updateLID();
    lastMemberCreated = docRef.id
    lastMemberName = memberInfo[0] + " " + memberInfo[1]
    lastMemberID = idNumber
    lastMemberDOB = memberInfo[2]
    lastMemberIDState = memberInfo[7]
    lastMemberIDNum = memberInfo[6]
    if (systemData.useESigning) {
      createFormSignScreen()      
    }
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
    if (products[1].restricted) {
      let isAllowed = false
      products[1].restrictedUsers.forEach(usersAllowed => {
        if (usersAllowed == getUID()){
          isAllowed = true
        }
      });
      if (isAllowed) {
        theClient.send('return-products-order', Array(products[0], products[1]))
        if (products[1].favorite) {
          theClient.send('return-products-order', Array(products[0], products[1]))
        }
      }
    }else{
      theClient.send('return-products-order', Array(products[0], products[1]))
      if (products[1].favorite) {
        theClient.send('return-products-order', Array(products[0], products[1]))
      }
    }
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
  const q = query(collection(db, "activity"), where('access', '==', getSystemAccess()));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach( async (change) => {
      if (change.type === "added") {
        if (!activitys.includes(change.doc.id)) {
          let theMemberInfo = false
          if (!change.doc.data().removed) {
            theMemberInfo = await getMemberInfo(change.doc.data().memberID);            
          }
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
    if (activity[1].active) {
      theClient.send('activity-request-return', Array(activity[0], activity[1], activity[2], activity[3]))      
    }
  })
}

function verifyUserEMail(){
  if (!user.emailVerified) {
    sendEmailVerification(auth.currentUser)
    notificationSystem('primary', 'A verification EMail has been sent. Please check your inbox and spam folder to verify.')
  }
}

async function attemptLogin(details){
  notificationSystem('warning', 'Logging in...')
  loginCreds = details;
  signInWithEmailAndPassword(auth, details[0], details[1])
  .then(async(userCredential) => {
    addLog('auth', 'Login successful for ' + details[1])
    user = userCredential.user;
    await getUserData()
    if (!getSystemAccess()) {
      mainWin.loadFile(path.join(__dirname, 'access.html'));
    } else {
      mainWin.loadFile(path.join(__dirname, 'index.html'));
      user = userCredential.user;
      setTimeout(function () { startLoading() }, 1000);
      setTimeout(function () { autoUpdater.checkForUpdatesAndNotify() }, 30000);
    }      
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    console.log(error);
    addLog('auth', 'Login attempt failed for user ' + details[0] + '. (' + errorCode + ')')
    if (errorCode == 'auth/invalid-email') {
      notificationSystem('danger', 'You must input an EMail.')
    } else if (errorCode == 'auth/missing-password') {
      notificationSystem('danger', 'You must input a Password.')
    } else if (errorCode == 'auth/user-not-found') {
      notificationSystem('danger', 'No account was found with this email/password combination.')
    } else if (errorCode == 'auth/wrong-password') {
      notificationSystem('danger', 'No account was found with this email/password combination.')
    } else if (errorCode == 'auth/user-disabled') {
      notificationSystem('danger', 'Your account was disabled/deleted. It has not yet been deleted. Create a support ticket.')
    } else if (errorCode == 'auth/too-many-requests') {
      notificationSystem('danger', 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.')
    } else if (errorCode == 'auth/network-request-failed') {
      notificationSystem('danger', 'Network Error. You do not have internet connection.')
    } else {
      notificationSystem('danger', errorMessage + ' (' + errorCode + ')')
    }
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
  totalLoadingProccesses = 11 // CHANGE ME

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading user data...'))
  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading system modules... This may take a couple minutes.'))
  let theUserData = await getUserData();
  if (!theUserData) {
    return
  }
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading system data...'))
  await getSystemData();
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

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading members...'))
  await startGatherAllMembers();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading activity...'))
  await startGatherAllActivity();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading orders...'))
  await startGatherAllOrders();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Loading quickbooks...'))
  await quickBooksLogin();
  loadingProgress = loadingProgress + 1

  theClient.send('send-loading-progress', Array(totalLoadingProccesses, loadingProgress, 'Finished loading!'))

  setTimeout(() => {
    searchForMessage()
  }, 10000);

  setInterval(function () {
    searchForMessage()
  }, 300000);

  goHome(true);
  await updateTLID();
  setTimeout(() => { 
    notificationSystem('primary', 'Welcome to CERMS! The system will continue to gather data. This may take a couple minutes. You may see less information when you first log in.')
    updateUserVersion()
  }, 2000);
}

function updateUserVersion(){
  if (userData.version != app.getVersion()) {
    updateDoc(doc(db, "users", getUID()), {
      version: app.getVersion(),
    });
    openChangelog()
  }
}

async function searchForMessage(){
  // TODO: CREATE SNAPSHOT TO LISTEN LIVE INSTEAD OF 5 MINUTES
  let theCurrentTime = Math.floor(Date.now() / 1000);
  let theCurrentTimeMS = new Date(theCurrentTime * 1000);

  const messagesRef = collection(db, "messages");

  const querySnapshot1 = await getDocs(query(messagesRef, where('expire', '>', theCurrentTimeMS)));
  querySnapshot1.forEach((doc) => {
    let theMsg = doc.data()
    if (theMsg.version && (theMsg.version != app.getVersion())) {
      return
    }
    if (theMsg.access) {
      let readMsg = false
      theMsg.access.forEach((server) => {
        if (server == getSystemAccess()) {
          readMsg = true          
        }
      })
      if (!readMsg) {
        return
      }
    }
    notificationSystem(theMsg.type, '[SYSTEM] ' + theMsg.message)
  })
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
        if (theHostName == "FWIN232PLUSFHD") {
          return
        }
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
  systemData.lid = Number(systemData.lid) + 1
  await updateDoc(docRef, {
    lid: Number(systemData.lid)
  });
}

async function updateOrderCustomerID(orderID, theCustomerID){
  const docRef = doc(db, "orders", orderID);
  await updateDoc(docRef, {
    customerID: theCustomerID
  });  
}

function userLogout(){
  app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) })
  app.exit(0)
}

async function getUserData(){
  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    userData = docSnap.data();    
    darkMode = userData.darkMode
    theClient.send('recieve-dark-mode', darkMode)
    return true
  }else{
    theClient.send('send-loading-progress', Array(0, 0, 'ACCOUNT DEACTIVATED!!! CONTACT MANAGER!!! Click <a href="login.html">here</a> to return to login...'))
    return false
  }
}

async function runAnalytics(timeStart, timeEnd){
  if (!canUser('permissionEditAnalytics')) {
    notificationSystem('warning', 'You do not have permisison to run analytics.')
    return
  }  
  notificationSystem('warning', 'Running analytics...')
  let membersDataSend = Array()
  let activitysDataSend = Array()
  let ordersDataSend = Array()

  if (timeStart) {
    let theTimeStartDate = new Date(timeStart);
    let theTimeStartSec = Math.floor(theTimeStartDate / 1000)
    let theTimeEndDate = new Date(timeEnd);
    let theTimeEndSec = Math.floor(theTimeEndDate / 1000)
    membersData.forEach(member => {
      if (member[1].creation_time.seconds > theTimeStartSec && member[1].creation_time.seconds < theTimeEndSec) {
        membersDataSend.push(member)
      }
    })
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
      theClient.send('analytics-return', Array(membersDataSend, activitysDataSend, productsData, ordersDataSend));      
      setTimeout(() => {
        notificationSystem('success', 'Analytics gathered!')
      }, 5000);
    }, 3000);
  }else{
    setTimeout(() => {
      theClient.send('analytics-return', Array(membersData, activitysData, productsData, ordersData));          
      setTimeout(() => {
        notificationSystem('success', 'Analytics gathered!')
      }, 5000);
    }, 3000);
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

const createFormSignScreen = () => {
  const swfWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: '/assets/cerms-icon.icns',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
    });

  swfWindow.loadFile(path.join(__dirname, 'swf.html'));

  swfWin = swfWindow
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

const createUploadFileScreen = () => {
  const uploadFileWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  uploadFileWindow.loadFile(path.join(__dirname, 'uploadfile.html'));

  uploadFileWin = uploadFileWindow
}

function emailReciept(theEMail){
  let p = path.join(app.getPath('userData'), '.', 'last-reciept.html');
  fs.readFile(p, 'utf-8', (err, data) => {
    if (err) {
      console.log(err.message);
      return;
    }
    createMail(theEMail, 'Reciept!', data, data)              
  })
}
const createRecieptScreen = (shouldChoice, logoutTF) => {
  const recieptWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
    });

  recieptWindow.loadFile(path.join(app.getPath('userData'), '.', 'last-reciept.html'));

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
        if (logoutTF) {
          userLogout()
        }
      } else {
        recieptWin.close()
        if (logoutTF) {
          userLogout()
        }
      }
    })
  }
};

async function openChangelog(){
  const response = await fetch('https://api.github.com/repos/matthewstriks/CERMS/releases/tags/v' + app.getVersion());
  const bodyJson = await response.json();
  let changelog = bodyJson.body

  const options = {
    type: 'info',
    title: 'Changelog',
    icon: './assets/cerms-icon.icns',
    message: "View what is new in this update!\n\n" + changelog + "\n",
    detail: 'Would you like to open this on GitHub?',
    buttons: ['Yes', 'No']
  }
  dialog.showMessageBox(options, function (index) {

  }).then(result => {
    if (result.response === 0) {
      shell.openExternal('https://github.com/matthewstriks/CERMS/releases/tag/v' + app.getVersion());
    }
  })
}

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
  notificationSystem('primary', 'Checking for new updates... You are currently using ' + app.getVersion())
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
  notificationSystem('success', 'No new updates. You have the latest version! (' + app.getVersion() + ')')
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

ipcMain.on('request-login-info', (event, arg) => {
  theClient = event.sender;
  let theDisplayName = getDisplayName();
  theClient.send('recieve-login-info', theDisplayName)
})

ipcMain.on('account-logout', (event, arg) => {
  userLogout();
})

ipcMain.on('membership-create', async (event, arg) => {
  theClient = event.sender;
  let alreadyExists = false
  const q2 = query(collection(db, "members"), where("dob", "==", arg[2]), where('idnum', "==", arg[6]), where('access', '==', getSystemAccess()));
  const querySnapshot2 = await getDocs(q2);
  querySnapshot2.forEach(async (doc) => {
    let theID = ""
    if (doc.id) {
      theID = "<a href='#' id='lastCreatedID' onclick='openMembership()' >" + doc.id + "</a>"
    }
    let theMsg = "This member already exists! ID: " + theID
    notificationSystem('warning', theMsg)
    alreadyExists = true
    return false
  });

  if (alreadyExists) {
    return false
  }

  if (importMembershipsMode) {
    createMembership(arg)
  } else {
    goOrder()
    createOrder(Array(false, arg[3], arg[0] + ' ' + arg[1]), 'membership', arg)
  }
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
  let rentalsToSend = Array()
  productsData.forEach(product => {
    if (product[1].rental) {
      rentalsToSend.push(product[1].name)
    }
  });
  rentalsToSend.sort()
  rentalsToSend.forEach(rental => {
    theClient.send('rentals-request-return', rental)
    theClient.send('home-checkoutmsg-return', systemData.checkoutMsg)    
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
  theClient.send('recieve-account2', Array(userData, systemData, oauthClient.isAccessTokenValid(), importMembershipsMode, user.emailVerified, debugMode))
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
    notificationSystem('warning', 'You do not have permisison to do this.')
    return
  }
  const docRef = doc(db, "users", arg[0]);
  updateDoc(docRef, {
    displayName: arg[1],
    rank: arg[2],
    access: arg[3],
    permissionViewProductsPage: arg[4],
    permissionEditCategory: arg[5],
    permissionEditProducts: arg[6],
    permissionEditDiscounts: arg[7],
    permissionWaiveProducts: arg[8],
    permissionEditCoreProducts: arg[9],
    permissionEditSystemSettings: arg[10],
    permissionEditRegisters: arg[11],
    permissionImportMemberMode: arg[12],
    permissionEditDNAAdd: arg[13],
    permissionEditDNARemove: arg[14],
    permissionEditTagAdd: arg[15],
    permissionEditTagRemove: arg[16],
    permissionEditMemberNotes: arg[17],
    permissionEditMemberFiles: arg[18],
    permissionDeleteMembers: arg[19],
    permissionEditAnalytics: arg[20],
    permissionEditVDTransactions: arg[21]
  });

  if (arg[0] == getUID()) {
    getUserData()
  }

  gatherAllUsers()

  theClient.send('account-edit-success')
  notificationSystem('success', 'Account edited!')
})

ipcMain.on('import-memberships-mode-status', (event, arg) => {
  theClient = event.sender;
  theClient.send('import-memberships-mode-status-return', Array(importMembershipsMode, systemData.useESigning))
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
    notificationSystem('warning', 'You do not have permission to do this.')
    return
  }
  createMail("matthew@striks.com", "!!DELETE ACCOUNT!!", "You can delete the account with UID " + arg[0], "You can delete the account with UID " + arg[0] + " Click <a href='https://console.firebase.google.com/u/0/project/cerms-7af24/authentication/users'>here</a>!")
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
  createOrder(Array(arg[2], arg[1][2], arg[1][1]), 'renew', arg)
})

ipcMain.on('activity-close', (event, arg) => {
  theClient = event.sender;
  closeActivity(arg)
  theClient.send('activity-request-return-remove')
})

ipcMain.on('activity-request', (event, arg) => {
  theClient = event.sender;
  displayAllActivity();
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

ipcMain.on('mandDNANotes-request', async (event, arg) => {
  theClient = event.sender;
  theClient.send('mandDNANotes-return', systemData.mandatoryDNANotes)
})

ipcMain.on('activity-edit', (event, arg) => {
  theClient = event.sender;
  editActivity(arg)
})

ipcMain.on("history-search", async (event, arg) => {
  theClient = event.sender;
  let wasFound = false
  if (arg != "") {
    notificationSystem('warning', 'Searching... This may take a few seconds. You will be notified when the query is finished.')
    for (i = 0; i < activitysData.length; i++) {
      let theActivityData = activitysData[i][1]
      let theMemberData = activitysData[i][2]
      let theName = theActivityData.lockerRoomStatus[2] + " " + theActivityData.lockerRoomStatus[1]
      let brokenArg = arg.split(" ");

      let a = new Date(theActivityData.timeIn.seconds * 1000);
      let year = a.getFullYear();
      let month = a.getMonth() + 1;
      let date = a.getDate();
      let theStartTime = month + '/' + date + '/' + year
      if (theMemberData && ((theMemberData.fname + ' ' + theMemberData.lname).toUpperCase() == arg.toUpperCase())) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (theMemberData && (theMemberData.fname.toUpperCase() == arg.toUpperCase())) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (theMemberData && (theMemberData.lname.toUpperCase() == arg.toUpperCase())) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (theActivityData.memberID == arg) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (arg.toUpperCase() == theName.toUpperCase()) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (arg.toUpperCase() == theActivityData.lockerRoomStatus[2].toUpperCase()) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (arg.toUpperCase() == theActivityData.lockerRoomStatus[1].toUpperCase()) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else if (arg == theStartTime) {
        wasFound = true
        theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
      } else {
        brokenArg.forEach((item, itemi) => {
          if (theName.includes(item) && !wasFound) {
            wasFound = true
            theClient.send('history-request-return', Array(activitysData[i][0], theActivityData, theMemberData))
          }
        });
      }
    }
  } else {
    displayAllHistory()
  }
  if (!wasFound && (arg != "")) {
    notificationSystem('warning', 'No activity was found by the search "' + arg + '"')
  } else {
    notificationSystem('success', 'Results found!')
  }
})

ipcMain.on("order-search", async (event, arg) => {
  theClient = event.sender;
  let wasFound = false
  if (arg != "") {
    notificationSystem('warning', 'Searching... This may take a few seconds. You will be notified when the query is finished.')
    for (i = 0; i < ordersData.length; i++) {
      let theOrderID = ordersData[i][0]
      let theOrderData = ordersData[i][1]
      let theOrderCustomerInfo = await getMemberInfo(theOrderData.customerID) || Array()        

      let theCustomerFName = theOrderCustomerInfo.fname || ""
      let theCustomerLName = theOrderCustomerInfo.lname || ""
      let brokenArg = arg.split(" ");

      let a = new Date(theOrderData.timestamp['seconds'] * 1000);
      let year = a.getFullYear();
      let month = a.getMonth() + 1;
      let date = a.getDate();
      let theStartTime = month + '/' + date + '/' + year
      if (theOrderID.toUpperCase() == arg.toUpperCase()) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      } else if (arg == theStartTime) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      } else if (arg == theOrderData.total[2]) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      } else if (arg.toUpperCase() == theCustomerFName.toUpperCase()) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      } else if (arg.toUpperCase() == theCustomerLName.toUpperCase()) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      } else if (arg.toUpperCase() == (theCustomerFName.toUpperCase() + " " + theCustomerLName.toUpperCase())) {
        wasFound = true
        theClient.send('history-order-request-return', Array(theOrderID, theOrderData, theOrderCustomerInfo))
      }
    }
  } else {
    displayAllOrders()
  }
  if (!wasFound && (arg != "")) {
    notificationSystem('warning', 'No order was found by the search "' + arg + '"')
  } else {
    notificationSystem('success', 'Results found!')
  }
})

ipcMain.on('searchForMember', (event, arg) => {
  theClient = event.sender;
  let wasFound = false
  if (arg != "") {
    for (i = 0; i < membersData.length; i++) {
      let theName = membersData[i][1].name.toUpperCase()
      let theID = Number(membersData[i][1].idnum)
      let theMemID = Number(membersData[i][1].id_number)
      let theDOB = membersData[i][1].dob
      let stringDate = false
      if (arg.includes('/') || arg.includes('-')) {
        stringDate = format(new Date(arg), "yyyy-MM-dd");        
      }
      let theMembership = membersData[i][1].membership_type.toUpperCase()
      let brokenArg = arg.split(" ");
      if (theName.includes(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      } else if (theID == Number(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      } else if (theMemID == Number(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      } else if (stringDate && (theDOB == stringDate)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      } else if (theMembership.includes(arg)) {
        wasFound = true
        theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
      }else{
        /*
        brokenArg.forEach((item, itemi) => {
          if (theName.includes(item) && !wasFound) {
            wasFound = true
            theClient.send('membership-request-return', Array(membersData[i][0], membersData[i][1]))
          }
        });
        */
      }
    }
  } else{
    displayAllMembers()
  }
  if (!wasFound && (arg != "")) {
    notificationSystem('warning', 'No member was found by the search "' + arg + '"')
  } else {
    notificationSystem('success', 'Results found!')
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
  createProduct(arg[0], arg[1], arg[2], arg[3], arg[4], arg[5], arg[6], arg[7], arg[8], arg[9], arg[10], arg[11], arg[12], arg[13], arg[14], arg[15], arg[16], arg[17], arg[18], arg[19], arg[20], arg[21])
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
  startRegister(arg, true)
})

ipcMain.on('starting-register-no-redirect', (event, arg) => {
  theClient = event.sender;
  startRegister(arg, false)
})

ipcMain.on('ending-register', (event, arg) => {
  theClient = event.sender;
//  updateRegisterSub(arg[2], Array(arg[0][11], 0, arg[0][13]), false, false)
  setTimeout(() => {
    endRegister(arg[0], arg[1])    
  }, 1000);
})

ipcMain.on('drop-register', (event, arg) => {
  theClient = event.sender;
  if (arg.length > 3) {
    updateRegisterSub(arg[0], Array(0, 0, -arg[1]), false, Array(arg[12], arg[13], arg[14], arg[15]))
  } else {
    createMoneyDrop(arg[0], arg[1])
  }
})

ipcMain.on('manage-ending-register', (event, arg) => {
  theClient = event.sender;
  manageEndRegister(arg)
})

ipcMain.on('order-checkout', (event, arg) => {
  theClient = event.sender;
  withProductsTxtTrial = arg[10]
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

ipcMain.on('remove-from-order', (event, arg) => {
  theClient = event.sender
  if (arg[0][1].rental) {
    notificationSystem('warning', 'If you are removing a rental, you must exit out of the order page and start over. Re-select the member to ensure you do not get duplicate check-ins.')
    pendingOrders.forEach(porder => {
      if (porder[3]) {
        if ((porder[3]) && (porder[3][0] == arg[0][0]) && (porder[3][1].name == arg[0][1].name) && (arg[1] == porder[2][2])) {
          porder[0] = false
          porder[1] = false
          porder[2] = false
          return
        }
        if (porder[0][1] == arg[0][1].name && porder[0][2] == arg[1]) {
          porder[0] = false
          porder[1] = false
          porder[2] = false
          return
        }
      }
    });
  } else if (arg[0][1].membership) {

  }
})

ipcMain.on('add-to-order', (event, arg) => {
  theClient = event.sender;
  if (arg[2]) {
    theLockerRoomInput = arg[2]
    theLockerRoomInput2 = arg[3]
  } else {
    theLockerRoomInput = false
    theLockerRoomInput2 = false
  }
  productsData.forEach(product => {
    if ((product[0] == arg[1][0]) && (!product[1].rental)) {
      addToOrder(arg[0], arg[1][0])      
    } else if ((product[0] == arg[1][0]) && (product[1].rental)) {
      if (!arg[0] || !arg[0][1]) {
        pendingOrders.unshift(Array(0, 'activity', Array(0, product[1].name, theLockerRoomInput, theLockerRoomInput2, false, false), arg[1]))
      }else{
        pendingOrders.unshift(Array(arg[0], 'activity', Array(arg[0][2], product[1].name, theLockerRoomInput, theLockerRoomInput2, false, false), arg[1]))
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

ipcMain.on('generate-final-report-now', (event, arg) => {
  theClient = event.sender;
  startRegisterReport(false, true)
})

ipcMain.on('uploadProductImg', (event, arg) => {
  theClient2 = event.sender;
  let theConfig;
  theConfig = firebaseConfig    
  theClient2.send('uploadProductImg-return', Array(theConfig, theProductImgID))
})

ipcMain.on('uploadProductFile', (event, arg) => {
  theClient2 = event.sender;
  let theConfig;
  theConfig = firebaseConfig    
  theClient2.send('uploadProductFile-return', Array(theConfig, theMemberFileID))
})

ipcMain.on('uploadProductImg-complete', async (event, arg) => {
  theClient2 = event.sender;

  const docRef = doc(db, "products", arg[0]);
  await updateDoc(docRef, {
    image: arg[1]
  });
  uploadImgWin.close()
})

ipcMain.on('uploadProductFile-complete', async (event, arg) => {
  theClient2 = event.sender;
  if (!canUser('permissionEditMemberFiles')) {
    notificationSystem('warning', 'You do not have permisison to add/manage member files.')
    return
  }

  const docRef = doc(db, "members", arg[0]);
  await updateDoc(docRef, {
    files: arrayUnion(arg[1]),
    filesNames: arrayUnion(arg[2]),
    filesNamesRaw: arrayUnion(arg[3])
  });
  uploadFileWin.close()
})

ipcMain.on('upload-member-file', (event, arg) => {
  theClient = event.sender;
  if (!canUser('permissionEditMemberFiles')) {
    notificationSystem('warning', 'You do not have permisison to add/manage member files.')
    return
  }
  theMemberFileID = arg
  createUploadFileScreen()
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
    notificationSystem('warning', 'Connecting to Quickbooks...')
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
  setTimeout(async () => {
    if (oauthClient.isAccessTokenValid()) {      
      quickbooksIsConnected = true
      console.log('Quickbooks has been connected.')
      if (parseRedirect) {
        notificationSystem('success', 'Quickbooks has been connected!')        
      }
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
      /*
      console.log('running');
      let theAuthToken = oauthClient.token.getToken();
      var qbo = new QuickBooks(quickbooksConfig.clientId,
        quickbooksConfig.clientSecret,
        theAuthToken,
        theAuthToken,
        false,
        true, // don't use the sandbox (i.e. for testing)
        true); // turn debugging on


      qbo.updateCustomer({
        Id: '42',
        SyncToken: '1',
        sparse: true,
        PrimaryEmailAddr: { Address: 'customer@example.com' }
      }, function (err, customer) {
        if (err) console.log(err)
        else console.log(customer)
      })
      */
      return true
    } else {
      quickbooksIsConnected = false
      console.log('Quickbooks is not connected.');
      return false
    }    
  }, 1000);  
}

function quickbooksGetAllProducts(){
  console.log('HERE: ');
  console.log(oauthClient.isAccessTokenValid());
  console.log(oauthClient.getToken().access_token);
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

ipcMain.on('request-changelog', async (event, arg) => {
  theClient = event.sender;
  openChangelog()
})

ipcMain.on('github-link', (event, arg) => {
  theClient = event.sender;
  shell.openExternal('https://github.com/matthewstriks/CERMS/issues/new/choose')
})

ipcMain.on('open-link', (event, arg) => {
  theClient = event.sender;
  shell.openExternal(arg)
})

ipcMain.on('get-dark-mode', (event, arg) => {
  theClient = event.sender;
  darkMode = userData.darkMode
  theClient.send('recieve-dark-mode', (darkMode || false))
})

ipcMain.on('change-dark-mode', (event, arg) => {
  theClient = event.sender;
  darkMode = arg
  userData.darkMode = arg
  const docRef = doc(db, "users", user.uid);
  updateDoc(docRef, {
    darkMode: arg,
  })
})

ipcMain.on('trash-note', async (event, arg) => {
  theClient = event.sender;
  if (!canUser('permissionEditMemberNotes')) {
    notificationSystem('warning', 'You do not have permission to remove member notes')
    return
  }

  let memberInfo = await getMemberInfo(arg[0])
  if (Array.isArray(memberInfo.notes)) {
    const docRef = doc(db, "members", arg[0]);
    await updateDoc(docRef, {
      notes: arrayRemove(memberInfo.notes[arg[1]]),
    })
  }
})

ipcMain.on('quickbooks-status', (event, arg) => {
  theClient = event.sender;  
  theClient.send('quickbooks-status-return', quickbooksIsConnected)
})

ipcMain.on('trash-member-file', async (event, arg) => {
  theClient = event.sender;  
  if (!canUser('permissionEditMemberFiles')) {
    notificationSystem('warning', 'You do not have permisison to remove member files.')
    return
  }

  const docRef = doc(db, "members", arg[0]);
  await updateDoc(docRef, {
    files: arrayRemove(arg[1]),
    filesNames: arrayRemove(arg[2]),
    filesNamesRaw: arrayRemove(arg[3]),
  })
  let theFileName = arg[3].substring(1)
  const desertRef = ref(storage, theFileName);

  deleteObject(desertRef).then(() => {
    notificationSystem('success', 'File has been deleted!')
  }).catch((error) => {
    console.log(error);
    notificationSystem('danger', 'Something went wrong.')
  });
})

ipcMain.on('settings-update-Account', async (event, arg) => {
  theClient = event.sender

  let currName = await getDisplayName()
  if (currName != arg[0]) {
    const docRef = doc(db, "users", getUID());
    updateDoc(docRef, {
      displayName: arg[0]
    })    
    notificationSystem('success', 'Display Name has been updated!')
  }

  let currEMail = await getEMail()
  if (currEMail != arg[1]) {
    updateEmail(auth.currentUser, arg[1]).then(() => {
      const docRef = doc(db, "users", getUID());
      updateDoc(docRef, {
        email: arg[1]
      })    
      notificationSystem('success', 'EMail has been updated!')
    }).catch((error) => {
      console.log(error);
      notificationSystem('danger', error.message)
    });    
  }

  if ((arg[2] && arg[3]) && (arg[2] == arg[3])){
    updatePassword(user, arg[3]).then(() => {
      notificationSystem('success', 'Password has been updated!')
    }).catch((error) => {
      console.log(error)
      notificationSystem('danger', error.message)
    });
  } else if (arg[2] && arg[3]) {
    notificationSystem('warning', 'Passwords did not match.')
  }
  getUserData()
})

ipcMain.on('settings-verify-email', (event, arg) => {
  theClient = event.sender
  verifyUserEMail()
})

ipcMain.on('settings-update-business-info', async (event, arg) => {
  theClient = event.sender
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }
  const docRef = doc(db, "system", getSystemAccess());
  updateDoc(docRef, {
    businessName: arg[0],
    businessAddress: arg[1],
    businessAddress2: arg[2],
    businessPNum: arg[3],
    businessEMail: arg[4]
  })
  getSystemData()
  notificationSystem('success', 'Business Info has been updated!')
})

ipcMain.on('settings-update-business-waiver-info', async (event, arg) => {
  theClient = event.sender
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }
  const docRef = doc(db, "system", getSystemAccess());
  updateDoc(docRef, {
    theWaiver: arg,
  })
  getSystemData()
  notificationSystem('success', 'Business Waiver has been updated!')
})

ipcMain.on('settings-update-esign-enable', async (event, arg) => {
  theClient = event.sender
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }
  const docRef = doc(db, "system", getSystemAccess());
  updateDoc(docRef, {
    useESigning: arg,
  })
  getSystemData()
  if (arg) {
    notificationSystem('success', 'ESigning has been enabled!')    
  } else {
    notificationSystem('success', 'ESigning has been disabled!')    
  }
})

ipcMain.on('settings-quickbooks-disconnect', async (event, arg) => {
  theClient = event.sender

  const docRef = doc(db, "system", getSystemAccess());
  await updateDoc(docRef, {
    quickBooksToken: ""
  })
  notificationSystem('success', "Quickbooks has been disconnected. Close the application and re-open to fully disconnect.")
  getSystemData()
})

ipcMain.on('settings-import-membership-mode-toggle', async (event, arg) => {
  theClient = event.sender;
  let isAllowed = await canUser('permissionImportMemberMode')
  if (!isAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }
  if (importMembershipsMode) {
    importMembershipsMode = false
  } else {
    importMembershipsMode = true
  }
  theClient.send('import-memberships-mode-status-return', importMembershipsMode)
  getSystemData()
})

ipcMain.on('settings-debug-mode-toggle', async (event, arg) => {
  theClient = event.sender;
  if (debugMode) {
    addLog('settings', 'Debug mode turned off.')
    debugMode = false
  } else {
    debugMode = true
    addLog('settings', 'Debug mode turned on.')
  }
  getSystemData()
})

ipcMain.on('settings-hide-npp-toggle', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    hideNPPSwitch: arg
  });
  await getSystemData()
})

ipcMain.on('settings-include-expire-time-renew-toggle', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    includeExpireTimeRenew: arg
  });
  await getSystemData()
})

ipcMain.on('settings-mandatory-DNANotes-toggle', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    mandatoryDNANotes: arg
  });
  await getSystemData()
})

ipcMain.on('settings-update-notification-seconds', async (event, arg) => {
  theClient = event.sender;
  const docRef = doc(db, "users", getUID());
  updateDoc(docRef, {
    notificationSecs: Number(arg)
  })    
  getUserData()
})

ipcMain.on('settings-update-invwarnemail', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    invWarnEMail: arg
  });
  await getSystemData()
})

ipcMain.on('settings-update-checkoutmsg', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    checkoutMsg: arg
  });
  await getSystemData()
})

ipcMain.on('settings-update-shifttimes', async (event, arg) => {
  theClient = event.sender;
  let userAllowed = canUser("permissionEditSystemSettings");
  if (!userAllowed) {
    notificationSystem('danger', 'You do not have permission to do this.')
    return
  }

  const docRef = doc(db, "system", userData.access);
  await updateDoc(docRef, {
    shiftTimeA: arg[0],
    shiftTimeB: arg[1],
    shiftTimeC: arg[2]
  });
  await getSystemData()
})

ipcMain.on('gather-notifications', async (event, arg) => {
  theClient = event.sender;
  getNotifications()
})

ipcMain.on('notification-system-remove-id', async (event, arg) => {
  theClient = event.sender;
  removeNotification(arg)
})

ipcMain.on('submit-support-ticket', async (event, arg) => {
  theClient = event.sender;

//  encodeURIComponent

  let theURL = 'https://clubentertainmentrms.com/support/index.php?a=add'

  theURL = theURL + '&name=' + encodeURIComponent(getDisplayName())
  theURL = theURL + '&email=' + encodeURIComponent(getEMail())
  theURL = theURL + '&catid=' + encodeURIComponent(arg[0])
  theURL = theURL + '&subject=' + encodeURIComponent(arg[1])
  theURL = theURL + '&message=' + encodeURIComponent(arg[2])
  theURL = theURL + '&custom2=' + encodeURIComponent(systemData.businessName)
  shell.openExternal(theURL)
})

ipcMain.on('uploadSignature', async (event, arg) => {
  theClient2 = event.sender;
  theClient2.send('uploadSignature-return', Array(firebaseConfig, systemData.theWaiver, lastMemberName, lastMemberCreated, lastMemberID, getSystemAccess(), lastMemberDOB, lastMemberIDState, lastMemberIDNum, getDisplayName()))
})

ipcMain.on('uploadSignatureComplete', async (event, arg) => {
  theClient2 = event.sender;
  let theURL = arg;
  const docRef = doc(db, "members", lastMemberCreated);
  await updateDoc(docRef, {
    signature: theURL,
    waiver_status: true
  });
  if (swfWin) {
    swfWin.close()
  }
  notificationSystem('success', 'Signature has been uploaded!')
})

ipcMain.on('edit-esign', async (event, arg) => {
  theClient = event.sender;
  let theMember = await getMemberInfo(arg)
  lastMemberName = theMember.name
  lastMemberCreated = arg
  lastMemberID = theMember.id_number
  lastMemberDOB = theMember.dob
  lastMemberIDState = theMember.idstate
  lastMemberIDNum = theMember.idnum
  createFormSignScreen()
  //  theClient2.send('uploadSignature-return', Array(firebaseConfig, systemData.theWaiver, lastMemberName, lastMemberCreated, lastMemberID, getSystemAccess(), lastMemberDOB, lastMemberIDState, lastMemberIDNum))
}) 

ipcMain.on('esign-delete', async (event, arg) => {
  theClient = event.sender;

  const desertRef = ref(storage, '/member-signature-pdfs/' + getSystemAccess() + '/' + arg + '.pdf');
  deleteObject(desertRef).then(() => {
    notificationSystem('success', 'Signature has been removed!')
  }).catch((error) => {
    notificationSystem('danger', 'Something went wrong!')
    console.log(error);
  });  
  const docRef = doc(db, "members", arg);
  await updateDoc(docRef, {
    signature: "",
    waiver_status: false
  });
}) 

ipcMain.on('void-delete-order', async (event, arg) => {
  theClient = event.sender;
  voidOrder(arg)
}) 

ipcMain.on('print-last-register-receipt', (event, arg) => {
  theClient = event.sender
  let lastRID = getLastRegister()
  notificationSystem('warning', 'Gathering last register receipt...')
  if (lastRID) {
    registerReciept(lastRID, false)    
  } else {
    notificationSystem('danger', 'You do not have a previous register saved...')
  }
})