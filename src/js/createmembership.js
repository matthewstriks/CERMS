const { fn } = require('jquery');
let createMembershipForm = document.getElementById('createMembershipForm');
let fnameInput = document.getElementById('fnameInput');
let mnameInput = document.getElementById('mnameInput');
let lnameInput = document.getElementById('lnameInput');
let suffixInput = document.getElementById('suffixInput');
let under21Txt = document.getElementById('under21Txt');
let babyImg = document.getElementById('babyImg');
let babyImg2 = document.getElementById('babyImg2');
let babyImg3 = document.getElementById('babyImg3');
let dobInput = document.getElementById('dobInput');
let emailInput = document.getElementById('emailInput');
let membershipInput = document.getElementById('membershipInput');
let membershipInputDiv = document.getElementById('membershipInputDiv')
let membershipCreationInput = document.getElementById('membershipCreationInput');
let membershipExpireInput = document.getElementById('membershipExpireInput');
let membershipMemberNumber = document.getElementById('membershipMemberNumber');
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
let memberUnder21 = false

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
  let fname = ""
  let mname = ""
  let suffix = ""
  let lname = ""
  let dob
  let clientID = ""
  let clientState = ""

  if (characters.length <= 5) {
    scanIDBtn.disabled = false
    scanIDTxt.value = ""
    scanIDBtn.click()
    return
  }

  for (let index = 0; index < characters.length; index++) {
    const element = characters[index];
    if (element.includes("DAC")) {
      fname = element.replace(/DAC/g, "");
    }
    if (element.includes("DAD")) {
      mname = element.replace(/DAD/g, "");
    }
    if (element.includes('DCS')) {
      lname = element.replace(/DCS/g, "");
    }
    if (element.includes('DAE')) {
      suffix = element.replace(/DAE/g, "");      
      console.log('Here: ' + suffix);
      errorMsg.className = 'alert alert-warning'
      errorMsg.innerHTML = "License has the suffix '" + suffix + "' please ensure it is entered correctly in the form."
    }
    if (element.includes('DBB')) {
      dob = element.replace(/DBB/g, "");
    }
    if (element.includes('DAQ')) {
      clientID = element.replace(/DAQ/g, "");
    }
    if (element.includes('DAJ')) {
      clientState = element.replace(/DAJ/g, "");
    }
  }

  fnameInput.value = capitalizeFirstLetter(fname.toLowerCase())
  mnameInput.value = capitalizeFirstLetter(mname.toLowerCase())
  lnameInput.value = capitalizeFirstLetter(lname.toLowerCase())
  suffixInput.value = suffix

  let theYear = dob.substring(4, 8)
  let theMonth = dob.substring(0, 2)
  let theDay = dob.substring(2, 4)

  dobInput.value = theYear + '-' + theMonth + '-' + theDay
  idnumInput.value = clientID
  idnumStateInput.value = clientState

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
  under21Txt.style.display = 'none'
  babyImg.style.display = 'none'
  babyImg2.style.display = 'none'
  babyImg3.style.display = 'none'
}

function updateBaby(){
  if (!memberUnder21) {
    under21Txt.style.display = 'none'
    
  }else{
    under21Txt.style.display = ''
  }

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
  memberUnder21 = false
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
    } else if ((theirAge == 18) && ((currMonth > theMonth) || ((currMonth <= theMonth) && (currDay >= theDay)))) {
      memberUnder18 = false
      updateBaby()
    } else {
      memberUnder18 = true
      updateBaby()
    }

    if (theirAge > 21) {
      memberUnder21 = false
      updateBaby()
    } else if (theirAge < 21){
      memberUnder21 = true
      updateBaby()
    } else if ((theirAge == 21) && ((currMonth > theMonth) || ((currMonth <= theMonth) && (currDay >= theDay)))) {
      memberUnder21 = false
      updateBaby()
    } else {
      memberUnder21 = true
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
  }else if (memberUnder21){
    let theError = 'Member is under 21...'
    errorMsg.className = 'alert alert-danger'
    errorMsg.innerHTML = theError;
  }
  ipcRenderer.send('membership-create', Array(fnameInput.value, lnameInput.value, dobInput.value, membershipInput.options[membershipInput.selectedIndex].text, notesInput.value, waiverInput.checked, idnumInput.value, idnumStateInput.value, emailInput.value, mnameInput.value, suffixInput.value, membershipCreationInput.value, membershipExpireInput.value, membershipMemberNumber.value))
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
  fnameInput.focus()
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

ipcRenderer.send('import-memberships-mode-status')

if (membershipInputDiv) {
  membershipInputDiv.style.display = 'none'
}

ipcRenderer.on('import-memberships-mode-status-return', (event, arg) => {
  if (arg) {
    membershipInputDiv.style.display = ''    
  }
})