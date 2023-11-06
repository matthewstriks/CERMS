const { ipcRenderer } = require('electron');
const { fn } = require('jquery');
let createMembershipForm = document.getElementById('createMembershipForm');
let fnameInput = document.getElementById('fnameInput');
let lnameInput = document.getElementById('lnameInput');
let babyImg = document.getElementById('babyImg');
let babyImg2 = document.getElementById('babyImg2');
let babyImg3 = document.getElementById('babyImg3');
let dobInput = document.getElementById('dobInput');
let emailInput = document.getElementById('emailInput');
let membershipInput = document.getElementById('membershipInput');
let notesInput = document.getElementById('notesInput');
let waiverInput = document.getElementById('waiverInput');
let idnumInput = document.getElementById('idnumInput');
let idnumStateInput = document.getElementById('idnumStateInput');
let submitBtn = document.getElementById('submitBtn');
let logoutBtn = document.getElementById('logoutBtn');
let scanIDBtn = document.getElementById('scanIDBtn');
let scanIDTxt = document.getElementById('scanIDTxt');
let scannerOn = false
let memberUnder18 = false

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1).trim();
}

if (scanIDBtn) {  
  fnameInput.focus();
  scanIDTxt.style.display = 'none'
  scanIDBtn.addEventListener('click', function(){
    if (scannerOn) {
      scanIDBtn.disabled = true
      scannerOn = false      
      scanIDTxt.style.display = 'none'
      fnameInput.focus()
      scanIDFunction()
    }else{
      scannerOn = true
      scanIDTxt.style.display = ''
      scanIDTxt.focus()
    }
  })
}

function scanIDFunction(){
  const text = scanIDTxt.value
  const characters = text.split("\n");

  if (characters.length <= 5) {
    scanIDBtn.disabled = false
    scanIDTxt.value = ""
    scanIDBtn.click()
    return
  }

  const rawfname = characters[7];
  const fname = rawfname.replace(/DAC/g, "");

  const rawlname = characters[6];
  const lname = rawlname.replace(/DCS/g, "");

  const rawdob = characters[10];
  const dob = rawdob.replace(/DBB/g, "");

  const rawclientID = characters[18];
  const clientID = rawclientID.replace(/DAQ/g, "");

  fnameInput.value = capitalizeFirstLetter(fname.toLowerCase())
  lnameInput.value = capitalizeFirstLetter(lname.toLowerCase())

  let theYear = dob.substring(4, 8)
  let theMonth = dob.substring(0, 2)
  let theDay = dob.substring(2, 4)

  dobInput.value = theYear + '-' + theMonth + '-' + theDay
  idnumInput.value = clientID

  scanIDBtn.disabled = false
  scanIDTxt.value = ""
}

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (createMembershipForm) {
  ipcRenderer.send('product-membership-request')
}

if (babyImg) {
  babyImg.style.display = 'none'
  babyImg2.style.display = 'none'
  babyImg3.style.display = 'none'
}

function updateBaby(){
  if (!memberUnder18) {
    babyImg.style.display = 'none'
    babyImg2.style.display = 'none'
    babyImg3.style.display = 'none'    
  }else{
    babyImg.style.display = ''
    babyImg2.style.display = ''
    babyImg3.style.display = ''    
  }
}

if (dobInput) {
  memberUnder18 = false
  dobInput.addEventListener('change', function(){
    let currYear = new Date().getFullYear();
    let currDay = new Date().getDate();
    let currMonth = new Date().getMonth() + 1
    let str = dobInput.value;
    let theYear = Number(str.substring(0, 4));
    let theMonth = Number(str.substring(5, 7));
    let theDay = Number(str.substring(8, 10));
    let theirAge = (currYear - theYear)    

    if (theirAge > 18) {
      memberUnder18 = false
      updateBaby()
    } else if (theirAge < 18){
      memberUnder18 = true
      updateBaby()
    } else if ((theirAge == 18) && (currMonth >= theMonth) && (currDay >= theDay)){
      memberUnder18 = false
      updateBaby()
    } else {
      memberUnder18 = true
      updateBaby()
    }
  })
}

function formWasSubmitted(){
  if (memberUnder18) {
    let theError = 'Member is under 18...'
    errorMsg.className = 'alert alert-danger'
    errorMsg.innerHTML = theError;
    submitBtn.disabled = true;
    return
  }
  ipcRenderer.send('membership-create', Array(fnameInput.value, lnameInput.value, dobInput.value, membershipInput.options[membershipInput.selectedIndex].text, notesInput.value, waiverInput.checked, idnumInput.value, idnumStateInput.value, emailInput.value))
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

ipcRenderer.on('membership-pending', (event, arg) => {
  submitBtn.disabled = true;
})

ipcRenderer.on('membership-pending-waiting-for-id', (event, arg) => {
  submitBtn.disabled = true;
})

ipcRenderer.on('membership-success', (event, arg) => {
  submitBtn.disabled = false;
  createMembershipForm.reset()
  document.getElementById(arg).addEventListener('click', function(){
    ipcRenderer.send('open-membership', arg)
  })
})

ipcRenderer.on('product-membership-request-return', (event, arg) => {
  var opt = document.createElement('option');
  opt.value = arg[0];
  opt.innerHTML = arg[1].name;
  membershipInput.appendChild(opt);
})