const { ipcRenderer } = require('electron')
var Tablesort = require('tablesort');
let productsData = Array()
let viewDNABtn = document.getElementById('viewDNABtn');
let unViewDNABtn = document.getElementById('unViewDNABtn');
let membershipSearch = document.getElementById('membershipSearch');
let membershipTable = document.getElementById('membershipTable');
let logoutBtn = document.getElementById('logoutBtn');
let addLockerRoomWarning = document.getElementById('addLockerRoomWarning');
let addLockerRoomInput = document.getElementById('addLockerRoomInput');
let addLockerRoomInput2 = document.getElementById('addLockerRoomInput2');
let addRentalSelect = document.getElementById('addRentalSelect');
let addLockerRoomCheck = document.getElementById('addLockerRoomCheck');
let addLockerRoomWaiverCheck = document.getElementById('addLockerRoomWaiverCheck');
let addLockerRoomWaiverCheckLbl = document.getElementById('addLockerRoomWaiverCheckLbl');
let completeCheckIn = document.getElementById('completeCheckIn');
let memberInfoDNA = document.getElementById('memberInfoDNA');
let memberInfoTag = document.getElementById('memberInfoTag');
let memberInfoTagC = document.getElementById('memberInfoTagC');
let memberInfoName = document.getElementById('memberInfoName');
let memberHistoryInfoName = document.getElementById('memberHistoryInfoName');
let memberInfoDOB = document.getElementById('memberInfoDOB');
let memberInfoEMail = document.getElementById('memberInfoEMail');
let memberInfoType = document.getElementById('memberInfoType');
let memberInfoExpires = document.getElementById('memberInfoExpires');
let memberInfoIDNum2 = document.getElementById('memberInfoIDNum2');
let memberInfoIDNum3 = document.getElementById('memberInfoIDNum3');
let memberInfoCT = document.getElementById('memberInfoCT');
let memberInfoWS = document.getElementById('memberInfoWS');
let memberInfoNotes = document.getElementById('memberInfoNotes');
let memberInfoNotesC = document.getElementById('memberInfoNotesC');
let memberInfoClose = document.getElementById('memberInfoClose');
let memberCreateOrder = document.getElementById('memberCreateOrder');
let scanIDBtn = document.getElementById('scanIDBtn');
let scanIDTxt = document.getElementById('scanIDTxt');
let scannerOn = false

// History
let memberHistoryOpen = document.getElementById('memberHistoryOpen');
let memberHistoryClose = document.getElementById('memberHistoryClose');

let memberOrderHistoryTable = document.getElementById('memberOrderHistoryTable')
let memberOrderHistoryTableBody = document.getElementById('memberOrderHistoryTableBody')

// edit
let editmemberInfoDNABtn = document.getElementById('editmemberInfoDNABtn');
let editmemberInfoTagBtn = document.getElementById('editmemberInfoTagBtn');
let editmemberInfoTagBtn2 = document.getElementById('editmemberInfoTagBtn2');
let editmemberInfoDNABtn2 = document.getElementById('editmemberInfoDNABtn2');
let editMembershipForm = document.getElementById('editMembershipForm');
let editmemberInfoName = document.getElementById('editmemberInfoName');
let editfnameInput = document.getElementById('editfnameInput');
let editlnameInput = document.getElementById('editlnameInput');
let editdobInput = document.getElementById('editdobInput');
let editemailInput = document.getElementById('editemailInput');
let editmembershipInput = document.getElementById('editmembershipInput');
let selectHelp = document.getElementById('selectHelp');
let editexpiresInput = document.getElementById('editexpiresInput');
let editidnumInput = document.getElementById('editidnumInput');
let editidnumStateInput = document.getElementById('editidnumStateInput');
let editnotesInput = document.getElementById('editnotesInput');
let editwaiverInput = document.getElementById('editwaiverInput');
let editmemberInfoDeleteBtn = document.getElementById('editmemberInfoDeleteBtn');
let editmemberInfoDeleteBtnCloseConfirm = document.getElementById('editmemberInfoDeleteBtnCloseConfirm');

let myModal2 = document.getElementById('myModal2');

let enterPressed = false;
let memberCheckingIn;
let memberCheckingInName;
let memberEditing;
let memberEditingType;
let memberEditingTypeFull;
let memberEditingExpTime;
let memberEditingName;
let memberTypeEdited = false;
let selectStatus = false;
let inputStatus = false;
let viwingMore = false;
let rank;

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (scanIDBtn) {
  scanIDTxt.style.display = 'none'
  scanIDBtn.addEventListener('click', function () {
    if (scannerOn) {
      scanIDBtn.disabled = true
      scannerOn = false
      scanIDTxt.style.display = 'none'
      scanIDFunction()
    } else {
      scannerOn = true
      scanIDTxt.style.display = ''
      scanIDTxt.focus()
    }
  })
}

function scanIDFunction() {
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

  membershipSearch.value = clientID
  searchForMember(clientID)

  scanIDBtn.disabled = false
  scanIDTxt.value = ""
}

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (document.getElementById('testTable')) {
  document.getElementById('testTable').style.display = 'none'
}

if (membershipTable) {
  ipcRenderer.send('membership-request')
  ipcRenderer.send('rank-request')
  ipcRenderer.send('rentals-request')
  ipcRenderer.send('product-membership-request')
  new Tablesort(membershipTable);
}

if (viewDNABtn) {
  unViewDNABtn.style.display = 'none'
  viewDNABtn.addEventListener('click', function(){
    unViewDNABtn.style.display = ''
    viewDNABtn.style.display = 'none'
    removeAllRows()
    ipcRenderer.send('membership-request-dna')
  })
}

if (unViewDNABtn) {
  unViewDNABtn.addEventListener('click', function(){
    unViewDNABtn.style.display = 'none'
    viewDNABtn.style.display = ''
    removeAllRows()
    ipcRenderer.send('membership-request')
  })
}

if (memberHistoryTable) {
  new Tablesort(memberHistoryTable);
}

if (memberOrderHistoryTable) {
  new Tablesort(memberOrderHistoryTable);
}

if (memberCreateOrder) {
  memberCreateOrder.addEventListener('click', function(){
    ipcRenderer.send('member-create-order', memberCheckingIn)
  })
}

if(document.getElementById('myModal4')){
  document.getElementById('myModal4').addEventListener('hidden.bs.modal', function () {
    if (!viwingMore) {
      let theRows = document.getElementById("memberHistoryTable").rows;
      for (let i = 1; i < theRows.length; i++) {
        theRows[i].style.display = 'none';
      }
      let theRows2 = document.getElementById("memberOrderHistoryTable").rows;
      for (let i = 1; i < theRows.length; i++) {
        theRows2[i].style.display = 'none';
      }
    }
  })
}

if(document.getElementById('myModal5')){
  document.getElementById('myModal5').addEventListener('hidden.bs.modal', function () {
    viwingMore = false;
  })
}

if (memberHistoryOpen) {
  memberHistoryOpen.addEventListener('click', function(){
    ipcRenderer.send('member-history-request', memberCheckingIn)
    memberHistoryInfoName.innerHTML = memberCheckingInName;
  })
}

if(myModal2){
  myModal2.addEventListener('hidden.bs.modal', function () {
    memberInfoDNA.innerHTML = '';
    memberInfoName.innerHTML = '';
    memberInfoDOB.innerHTML = '';
    memberInfoEMail.innerHTML = '';
    memberInfoType.innerHTML = '';
    memberInfoExpires.innerHTML = '';
    memberInfoIDNum2.innerHTML = '';
    memberInfoIDNum3.innerHTML = '';
    memberInfoCT.innerHTML = '';
    memberInfoWS.innerHTML = '';
    memberInfoNotes.value = '';
  })
}

if (memberInfoClose) {
  memberInfoClose.addEventListener('click', function(){
    memberInfoDNA.innerHTML = '';
    memberInfoName.innerHTML = '';
    memberInfoDOB.innerHTML = '';
    memberInfoEMail.innerHTML = '';
    memberInfoType.innerHTML = '';
    memberInfoExpires.innerHTML = '';
    memberInfoIDNum2.innerHTML = '';
    memberInfoIDNum3.innerHTML = '';
    memberInfoCT.innerHTML = '';
    memberInfoWS.innerHTML = '';
    memberInfoNotes.value = '';
  })
}

if (addRentalSelect) {
  addRentalSelect.addEventListener('change', function(){
    if (addRentalSelect.value == "") {
      selectStatus = false;
      completeCheckIn.disabled = true;
    }else{
      selectStatus = true;
      if (inputStatus) {
        completeCheckIn.disabled = false;
      }
    }
  })
}

if (addLockerRoomInput) {
  addLockerRoomInput.addEventListener('change', function(){
    if (addLockerRoomInput.value == "") {
      inputStatus = false;
      completeCheckIn.disabled = true;
    }else{
      inputStatus = true;
      if (selectStatus) {
        completeCheckIn.disabled = false;
      }
    }
  })
}

if(completeCheckIn){
  completeCheckIn.addEventListener('click', function(){
    if (addRentalSelect.value == "" || addLockerRoomInput.value == "") {
      addLockerRoomWarning.innerHTML = 'Please fill the below information.'
    }else{
      ipcRenderer.send('activity-create', Array(memberCheckingIn, addRentalSelect.value, addLockerRoomInput.value, addLockerRoomInput2.value, addLockerRoomCheck.checked, addLockerRoomWaiverCheck.checked))
      addRentalSelect.value = "";
      addLockerRoomInput.value = "";
      addLockerRoomInput2.value = "";
      addLockerRoomCheck.checked = false
      addLockerRoomWaiverCheck.checked = false
    }
  })
}

if(editmemberInfoDNABtn){
  editmemberInfoDNABtn.addEventListener('click', function(){
    ipcRenderer.send('member-dna', Array(memberEditing, editnotesInput.value))
  })
}

if(editmemberInfoDNABtn2){
  editmemberInfoDNABtn2.addEventListener('click', function(){
    ipcRenderer.send('member-undna', Array(memberEditing, editnotesInput.value))
  })
}

if(editmemberInfoTagBtn){
  editmemberInfoTagBtn.addEventListener('click', function(){
    ipcRenderer.send('member-tag', memberEditing)
  })
}

if(editmemberInfoTagBtn2){
  editmemberInfoTagBtn2.addEventListener('click', function(){
    ipcRenderer.send('member-untag', memberEditing)
  })
}

document.getElementById('editmemberSubmitForm').addEventListener('click', function(){
    formWasSubmitted()
})

function formWasSubmitted(){
  ipcRenderer.send('membership-update', Array(memberEditing, editfnameInput.value, editlnameInput.value, editdobInput.value, editmembershipInput.value, editexpiresInput.value, editidnumInput.value, editidnumStateInput.value, editnotesInput.value, editwaiverInput.checked, editemailInput.value, memberTypeEdited));
  memberTypeEdited = false
  editMembershipForm.reset();
}

function searchForMember(filter){
  removeAllRows()
  ipcRenderer.send('searchForMember', filter);
}

function updateExpireDate(){
  let memberEditingType = editmembershipInput.value;
  let idExpiration = "";
  let theCurrentTime = Math.floor(Date.now() / 1000);
  let currMemberInfo = memberEditingExpTime;
  let currMemberInfoType = memberEditingType;
  let isExpired;

  if (currMemberInfo <= theCurrentTime) {
    isExpired = true
  }else {
    isExpired = false
  }

  let theProduct;
  productsData.forEach(products => {
    if (memberEditingType == products[1].name) {
      theProduct = products
      if (isExpired) {
        idExpiration = theCurrentTime + products[1].membershipLength;
        changeExpiresTime(idExpiration);
      } else {
        idExpiration = currMemberInfo + products[1].membershipLength;
        changeExpiresTime(idExpiration);
      }
    }
  });

  if (editmembershipInput.value == '') {
    selectHelp.innerHTML = '';
    memberTypeEdited = false
  }else {
    memberTypeEdited = true
    selectHelp.innerHTML = 'Selecting ' + theProduct[1].name + ' will add ' + theProduct[1].membershipLengthRaw + ' ' + theProduct[1].membershipLengthType + ' to an already existing membership OR give ' + theProduct[1].membershipLengthRaw + ' ' + theProduct[1].membershipLengthType + ' if no valid memberships already exists.';
  }
}

if (editmembershipInput) {
  editmembershipInput.addEventListener('click', function(){updateExpireDate()})
  editmembershipInput.addEventListener('change', function(){updateExpireDate()})
}

if(membershipSearch){
  membershipSearch.focus();
  membershipSearch.addEventListener("keydown", function (e) {
    if (e.code == "Enter" || e.code == "Numpad Enter" || e.keyCode == 13) {
      enterPressed = true;
      var filter, tr, td, i, txtValue;
      filter = membershipSearch.value.toUpperCase();
      tr = membershipTable.getElementsByTagName("tr");
      searchForMember(filter)
      //for (i = 0; i < tr.length; i++) {
      //  if (membershipSearch.value == '') {
      //    enterPressed = false;
      //    tr[i].style.display = "";
      //  }
      //  if (tr[i].id == membershipSearch.value || tr[i].id == 'header' || tr[i].getAttribute("memberid") == membershipSearch.value) {
      //    tr[i].style.display = "";
      //  }else{
      //    tr[i].style.display = "none";
      //  }
      //}
    }
  });
}

function membershipSearchFunct() {
//  var filter, tr, td, i, txtValue;
//  filter = membershipSearch.value.toUpperCase();
//  tr = membershipTable.getElementsByTagName("tr");
//  for (i = 0; i < tr.length; i++) {
//    td = tr[i].getElementsByTagName("td")[0];
//    if (td) {
//      txtValue = td.textContent || td.innerText;
//      if (!enterPressed) {
//        if (txtValue.toUpperCase().indexOf(filter) > -1) {
//          tr[i].style.display = "";
//        } else {
//          tr[i].style.display = "none";
//        }
//      }else{
//        if (txtValue == "") {
//          enterPressed = false;
//        }
//      }
//    }
//  }
}

function changeExpiresTime(expTime){
  let a2 = new Date(expTime * 1000);
  let year = a2.getFullYear();
  let month = a2.getMonth() + 1;
  let day = a2.getDate();
  if (day <= 9) {
    tday = '0' + day
  }else{
    tday = day
  }
  if (month <= 9) {
    tmonth = '0' + month
  }else{
    tmonth = month
  }
  let hour = a2.getHours()
  if (hour <= 9) {
    thour = '0' + hour
  }else{
    thour = hour
  }
  let min = a2.getMinutes()
  if (min <= 9) {
    tmin = '0' + min
  }else{
    tmin = min
  }
  let sec = a2.getSeconds()
  if (sec <= 9) {
    tsec = '0' + sec
  }else{
    tsec = sec
  }
  let theTime = year + '-' + tmonth + '-' + tday + 'T' + thour + ':' + tmin + ':' + tsec;
  editexpiresInput.value = theTime;
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

//Get the button:
mybutton = document.getElementById("myBtn");

// When the user scrolls down 20px from the top of the document, show the button
window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 300) {
    mybutton.style.display = "block";
  } else {
    mybutton.style.display = "none";
  }
}

// When the user clicks on the button, scroll to the top of the document
function topFunction() {
  document.body.scrollTop = 0; // For Safari
  document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
}

ipcRenderer.on('rentals-request-return', (event, arg) => {
  var opt = document.createElement('option');
  opt.value = arg;
  opt.innerHTML = arg;
  addRentalSelect.appendChild(opt);
})

ipcRenderer.on('product-membership-request-return', (event, arg) => {
  productsData.push(arg)
  var opt = document.createElement('option');
  opt.value = arg[1].name;
  opt.innerHTML = arg[1].name;
  editmembershipInput.appendChild(opt);
})

ipcRenderer.on('open-membership-return', (event, arg) => {
  document.getElementById('viewinfo'+arg).click();
})

ipcRenderer.on('membership-request-return-remove', (event, arg) => {
  document.getElementById('row'+arg[0]).remove();
})

function removeAllRows(){
  let theRows = 1;
  var table = document.getElementById("membershipTable");
  var rowCount = table.rows.length;
  for (var i = theRows; i < rowCount; i++) {
      table.deleteRow(theRows);
  }
}

ipcRenderer.on('membership-request-return', (event, arg) => {
  var row = membershipTable.insertRow(1);
  row.id = 'row'+arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'namecell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'dobcell'+arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'typecell'+arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'expirecell'+arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'buttoncell'+arg[0];

  var a2 = new Date(arg[1].id_expiration * 1000);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var year2 = a2.getFullYear();
  var month2 = months[a2.getMonth()];
  var date2 = a2.getDate();
  let hour2 = a2.getHours();
  let ampm = "AM"
  if (hour2 > 12) {
    ampm = "PM"
    hour2 = hour2 - 12
  }
  var min2 = a2.getMinutes();
  var sec2 = a2.getSeconds();
  var time2 = month2 + ' ' + date2 + ' ' + ' ' + year2 + ' ' + hour2 + ':' + min2 + ':' + sec2 + ' ' + ampm;

  row.setAttribute('memberid', arg[0]);
  cell1.innerHTML = arg[1].name;
  cell2.innerHTML = arg[1].dob;
  cell3.innerHTML = arg[1].membership_type;
  cell4.innerHTML = time2;
  cell5.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal' id='checkIn"+arg[0]+"' type='button' class='btn btn-success'>Check-In</button> <button id='viewinfo" +arg[0] + "' data-bs-toggle='modal' data-bs-target='#myModal2' type='button' class='btn btn-primary'>View Member</button> <button id='edit" +arg[0] + "' data-bs-toggle='modal' data-bs-target='#myModal3' type='button' class='btn btn-warning'>Edit Member</button>";

  let currSeconds = Math.floor(Date.now() / 1000);
  let secondsInbetween = arg[1].id_expiration - currSeconds;

  if (arg[1].membership_type == 'gold') {
    row.classList.add('table-success')
  }
  if (arg[1].membership_type == 'gold' && secondsInbetween <= 0) {
    row.classList.add('table-warning')
  }
  if (arg[1].membership_type == 'industry') {
    row.classList.add('table-dark')
  }
  if (arg[1].membership_type == 'vip') {
    row.classList.add('table-secondary')
  }

  if (arg[1].dna) {
    row.classList.add('table-danger')
    document.getElementById("checkIn"+arg[0]).disabled = true
    document.getElementById("checkIn"+arg[0]).innerHTML = 'DO NOT ADMIT'
    document.getElementById("checkIn"+arg[0]).className = 'btn btn-danger'
  }

  document.getElementById("checkIn"+arg[0]).addEventListener('click', function(){
    if (arg[1].waiver_status) {
      addLockerRoomWaiverCheck.style.display = 'none'
      addLockerRoomWaiverCheckLbl.style.display = 'none'
    }else{
      addLockerRoomWaiverCheck.style.display = ''
      addLockerRoomWaiverCheckLbl.style.display = ''
    }
    if (arg[1].tag) {
      memberInfoTagC.style.display = ''
      memberInfoNotesC.style.display = ''      
    }else{
      memberInfoTagC.style.display = 'none'
      memberInfoNotesC.style.display = 'none'
      memberInfoNotesC.innerHTML = arg[1].notes
    }
    memberCheckingIn = arg[0];
    memberCheckingInName = arg[1].name;
    addRentalSelect.focus();
  })

  document.getElementById("viewinfo"+arg[0]).addEventListener('click', function(){
    memberCheckingIn = arg[0];
    memberCheckingInName = arg[1].name;
    if (arg[1].creation_time.seconds) {
      var a = new Date(arg[1].creation_time.seconds * 1000);
    }else{
      var a = new Date(arg[1].creation_time * 1000);
    }
    var a2 = new Date(arg[1].id_expiration * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var year2 = a2.getFullYear();
    var month = months[a.getMonth()];
    var month2 = months[a2.getMonth()];
    var date = a.getDate();
    var date2 = a2.getDate();
    let hour = a.getHours();
    let hour2 = a2.getHours();
    let ampm = "AM"
    let ampm2 = "AM"
    if (hour > 12) {
      ampm = "PM"
      hour = hour - 12
    }
    if (hour2 > 12) {
      ampm2 = "PM"
      hour2 = hour2 - 12
    }
    var min = a.getMinutes();
    var min2 = a2.getMinutes();
    var sec = a.getSeconds();
    var sec2 = a2.getSeconds();
    var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec + ' ' + ampm;
    var time2 = month2 + ' ' + date2 + ' ' + ' ' + year2 + ' ' + hour2 + ':' + min2 + ':' + sec2 + ' ' + ampm2;

    if (arg[1].tag) {
      memberInfoTag.innerHTML = 'READ NOTES'
    }else{
      memberInfoTag.innerHTML = ''
    }

    if (arg[1].dna) {
      memberInfoDNA.innerHTML = 'DO NOT ADMIT'
    }else {
      memberInfoDNA.innerHTML = ''
    }

    memberInfoName.innerHTML = arg[1].name;
    memberInfoDOB.innerHTML = 'DOB: ' + arg[1].dob;
    memberInfoEMail.innerHTML = 'EMail: ' + (arg[1].email || 'N/A');
    memberInfoType.innerHTML = 'Membership Type: ' + arg[1].membership_type;
    memberInfoExpires.innerHTML = 'ID Expires: ' + time2;
    memberInfoIDNum2.innerHTML = 'State ID Number: ' + arg[1].idnum;
    memberInfoIDNum3.innerHTML = 'ID State: ' + arg[1].idstate;
    memberInfoCT.innerHTML = 'Creation Time: ' + time;
    memberInfoWS.innerHTML = 'Waiver Status: ' + arg[1].waiver_status;
    memberInfoNotes.value = arg[1].notes;
  })

  document.getElementById("edit"+arg[0]).addEventListener('click', function(){
    selectHelp.innerHTML = "Click the membership to 'renew'. If you want to undo this, select the '---' option and it will return to the old membership.";
    memberEditing = arg[0]
    memberEditingType = arg[1].membership_type;
    memberEditingTypeFull = arg[1].membership_type;
    memberEditingExpTime = arg[1].id_expiration;
    memberEditingName = arg[1].fname + ' ' + arg[1].lname;
    changeExpiresTime(arg[1].id_expiration);

    if (arg[1].dna) {
      editmemberInfoDNABtn.style.display = 'none';
      editmemberInfoDNABtn2.style.display = '';
      memberInfoDNA.innerHTML = 'DO NOT ADMIT'
    }else{
      editmemberInfoDNABtn.style.display = '';
      editmemberInfoDNABtn2.style.display = 'none';
    }

    if (arg[1].tag) {
      editmemberInfoTagBtn.style.display = 'none';
      editmemberInfoTagBtn2.style.display = '';
      memberInfoTag.innerHTML = 'READ NOTES'
    }else{
      editmemberInfoTagBtn.style.display = '';
      editmemberInfoTagBtn2.style.display = 'none';
    }

    editfnameInput.value = arg[1].fname;
    editlnameInput.value = arg[1].lname;
    if (arg[1].dob.includes("/")) {
      let oldDOB = arg[1].dob;
      let newDOBM = oldDOB.substring(0, 2)
      let newDOBD = oldDOB.substring(3, 5)
      let newDOBY = oldDOB.substring(6, 10)
      let newDOB = newDOBY + '-' + newDOBM + '-' + newDOBD
      editdobInput.value = newDOB;
    }else{
      editdobInput.value = arg[1].dob;
    }
    editemailInput.value = (arg[1].email || '')
    editmembershipInput.value = arg[1].membership_type.toLowerCase();
    editidnumInput.value = arg[1].idnum;
    editidnumStateInput.value = arg[1].idstate;
    editnotesInput.value = arg[1].notes;
    if (arg[1].waiver_status) {
      editwaiverInput.checked = true;
    }else {
      editwaiverInput.checked = false;
    }
  })
})

ipcRenderer.on('membership-request-return-update', (event, arg) => {
  var a2 = new Date(arg[1].id_expiration * 1000);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var year2 = a2.getFullYear();
  var month2 = months[a2.getMonth()];
  var date2 = a2.getDate();
  let hour2 = a2.getHours();
  let ampm2 = "AM"
  if (hour2 > 12) {
    ampm2 = "PM"
    hour2 = hour2 - 12
  }
  var min2 = a2.getMinutes();
  var sec2 = a2.getSeconds();
  var time2 = month2 + ' ' + date2 + ' ' + ' ' + year2 + ' ' + hour2 + ':' + min2 + ':' + sec2 + ' ' + ampm2;
  document.getElementById('namecell' + arg[0]).innerHTML = arg[1].name;
  document.getElementById('dobcell' + arg[0]).innerHTML = arg[1].dob;
  document.getElementById('typecell' + arg[0]).innerHTML = arg[1].membership_type;
  document.getElementById('expirecell' + arg[0]).innerHTML = time2;

  let currSeconds = Math.floor(Date.now() / 1000);
  let secondsInbetween = arg[1].id_expiration - currSeconds;

  if (arg[1].membership_type == 'gold') {
    document.getElementById('row' + arg[0]).classList.add('table-success')
  }
  if (arg[1].membership_type == 'gold' && secondsInbetween <= 0) {
    document.getElementById('row' + arg[0]).classList.add('table-warning')
  }
  if (arg[1].membership_type == 'industry') {
    document.getElementById('row' + arg[0]).classList.add('table-dark')
  }
  if (arg[1].membership_type == 'vip') {
    document.getElementById('row' + arg[0]).classList.add('table-secondary')
  }

  if (arg[1].dna) {
    document.getElementById('row' + arg[0]).classList.add('table-danger')
    document.getElementById("checkIn" + arg[0]).disabled = true
    document.getElementById("checkIn" + arg[0]).innerHTML = 'DO NOT ADMIT'
    document.getElementById("checkIn" + arg[0]).className = 'btn btn-danger'
  } else {
    document.getElementById('row' + arg[0]).classList.remove('table-danger')
    document.getElementById("checkIn" + arg[0]).disabled = false
    document.getElementById("checkIn" + arg[0]).innerHTML = 'Check-In'
    document.getElementById("checkIn" + arg[0]).className = 'btn btn-success'
  }

  document.getElementById("checkIn" + arg[0]).addEventListener('click', function () {
    if (arg[1].waiver_status) {
      addLockerRoomWaiverCheck.style.display = 'none'
      addLockerRoomWaiverCheckLbl.style.display = 'none'
    } else {
      addLockerRoomWaiverCheck.style.display = ''
      addLockerRoomWaiverCheckLbl.style.display = ''
    }
    if (arg[1].tag) {
      memberInfoTagC.style.display = ''
      memberInfoNotesC.style.display = ''
    } else {
      memberInfoTagC.style.display = 'none'
      memberInfoNotesC.style.display = 'none'
      memberInfoNotesC.innerHTML = arg[1].notes
    }
    memberCheckingIn = arg[0];
    memberCheckingInName = arg[1].name;
    addRentalSelect.focus();
  })

  document.getElementById("viewinfo" + arg[0]).addEventListener('click', function () {
    memberCheckingIn = arg[0];
    memberCheckingInName = arg[1].name;
    if (arg[1].creation_time.seconds) {
      var a = new Date(arg[1].creation_time.seconds * 1000);
    } else {
      var a = new Date(arg[1].creation_time * 1000);
    }
    var a2 = new Date(arg[1].id_expiration * 1000);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var year = a.getFullYear();
    var year2 = a2.getFullYear();
    var month = months[a.getMonth()];
    var month2 = months[a2.getMonth()];
    var date = a.getDate();
    var date2 = a2.getDate();
    let hour = a.getHours();
    let hour2 = a2.getHours();
    let ampm = "AM"
    let ampm2 = "AM"
    if (hour > 12) {
      ampm = "PM"
      hour = hour - 12
    }
    if (hour2 > 12) {
      ampm2 = "PM"
      hour2 = hour2 - 12
    }
    var min = a.getMinutes();
    var min2 = a2.getMinutes();
    var sec = a.getSeconds();
    var sec2 = a2.getSeconds();
    var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec + ' ' + ampm;
    var time2 = month2 + ' ' + date2 + ' ' + ' ' + year2 + ' ' + hour2 + ':' + min2 + ':' + sec2 + ' ' + ampm2;

    if (arg[1].tag) {
      memberInfoTag.innerHTML = 'READ NOTES'
    } else {
      memberInfoTag.innerHTML = ''
    }

    if (arg[1].dna) {
      memberInfoDNA.innerHTML = 'DO NOT ADMIT'
    } else {
      memberInfoDNA.innerHTML = ''
    }

    memberInfoName.innerHTML = arg[1].name;
    memberInfoDOB.innerHTML = 'DOB: ' + arg[1].dob;
    memberInfoEMail.innerHTML = 'EMail: ' + (arg[1].email || 'N/A');
    memberInfoType.innerHTML = 'Membership Type: ' + arg[1].membership_type;
    memberInfoExpires.innerHTML = 'ID Expires: ' + time2;
    memberInfoIDNum2.innerHTML = 'State ID Number: ' + arg[1].idnum;
    memberInfoIDNum3.innerHTML = 'ID State: ' + arg[1].idstate;
    memberInfoCT.innerHTML = 'Creation Time: ' + time;
    memberInfoWS.innerHTML = 'Waiver Status: ' + arg[1].waiver_status;
    memberInfoNotes.value = arg[1].notes;
  })

  document.getElementById("edit" + arg[0]).addEventListener('click', function () {
    selectHelp.innerHTML = "Click the membership to 'renew'. If you want to undo this, select the '---' option and it will return to the old membership.";
    memberEditing = arg[0]
    memberEditingType = arg[1].membership_type;
    memberEditingTypeFull = arg[1].membership_type;
    memberEditingExpTime = arg[1].id_expiration;
    memberEditingName = arg[1].fname + ' ' + arg[1].lname;
    changeExpiresTime(arg[1].id_expiration);

    if (arg[1].dna) {
      editmemberInfoDNABtn.style.display = 'none';
      editmemberInfoDNABtn2.style.display = '';
      memberInfoDNA.innerHTML = 'DO NOT ADMIT'
    } else {
      editmemberInfoDNABtn.style.display = '';
      editmemberInfoDNABtn2.style.display = 'none';
    }

    if (arg[1].tag) {
      editmemberInfoTagBtn.style.display = 'none';
      editmemberInfoTagBtn2.style.display = '';
      memberInfoTag.innerHTML = 'READ NOTES'
    } else {
      editmemberInfoTagBtn.style.display = '';
      editmemberInfoTagBtn2.style.display = 'none';
    }

    editfnameInput.value = arg[1].fname;
    editlnameInput.value = arg[1].lname;
    if (arg[1].dob.includes("/")) {
      let oldDOB = arg[1].dob;
      let newDOBM = oldDOB.substring(0, 2)
      let newDOBD = oldDOB.substring(3, 5)
      let newDOBY = oldDOB.substring(6, 10)
      let newDOB = newDOBY + '-' + newDOBM + '-' + newDOBD
      editdobInput.value = newDOB;
    } else {
      editdobInput.value = arg[1].dob;
    }
    editemailInput.value = (arg[1].email || '')
    editmembershipInput.value = arg[1].membership_type.toLowerCase();
    editidnumInput.value = arg[1].idnum;
    editidnumStateInput.value = arg[1].idstate;
    editnotesInput.value = arg[1].notes;
    if (arg[1].waiver_status) {
      editwaiverInput.checked = true;
    } else {
      editwaiverInput.checked = false;
    }
  })
})

ipcRenderer.on('member-order-history-request-return', (event, arg) => {
  var row = memberOrderHistoryTable.insertRow(1);
  row.id = 'row' + arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'infocell' + arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'datecell' + arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'amountcell' + arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'actioncell' + arg[0];

  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var a = new Date(arg[1].timestamp * 1000);
  var year = a.getFullYear();
  var month = a.getMonth() + 1;
  var fancyMonth = months[a.getMonth()];
  var date = a.getDate();
  let hour = String(a.getHours()).padStart(2, '0');
  let ampm = "AM"
  if (Number(hour) > 12) {
    ampm = "PM"
    hour = Number(hour) - 12
  }
  var min = String(a.getMinutes()).padStart(2, '0');
  var sec = a.getSeconds();
  var time = month + '/' + date + '/' + year + ' ' + hour + ':' + min + ':' + sec + ' ' + ampm;

  cell1.innerHTML = arg[0]
  cell2.innerHTML = time;
  cell3.innerHTML = arg[1].total;
  cell4.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal7' id='viewinfo" + arg[0] + "' type='button' class='btn btn-success'>View Info</button>";

  document.getElementById('viewinfo' + arg[0]).addEventListener('click', function () {
    viwingMore = true;
    // All order info  
    //    document.getElementById('memberHistoryInfoNameTotal').innerHTML = memberCheckingInName
    //    document.getElementById('memberHistoryInfoNotes').value = arg[1].notes
  })
})

ipcRenderer.on('member-history-request-return', (event, arg) => {
  if (arg[1].active) {
    return
  }
  var row = memberHistoryTable.insertRow(1);
  row.id = 'row'+arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'datacell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'timeincell'+arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'timeoutcell'+arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'duationcell'+arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'lockerroomcell'+arg[0];
  var cell6 = row.insertCell(5);
  cell6.id = 'actioncell'+arg[0];

  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var a = new Date(arg[1].timeIn.seconds * 1000);
  var year = a.getFullYear();
  var month = a.getMonth()+1;
  var fancyMonth = months[a.getMonth()];
  var date = a.getDate();
  let hour = String(a.getHours()).padStart(2, '0');
  let ampm = "AM"
  if (Number(hour) > 12) {
    ampm = "PM"
    hour = Number(hour) - 12
  }
  var min = String(a.getMinutes()).padStart(2, '0');
  var sec = a.getSeconds();
  var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec + ' ' + ampm;

  var a2 = new Date(arg[1].timeOut.seconds * 1000);
  var year2 = a2.getFullYear();
  var month2 = a2.getMonth()+1;
  var fancyMonth2 = months[a2.getMonth()];
  var date2 = a2.getDate();
  let hour2 = String(a2.getHours()).padStart(2, '0');
  let ampm2 = "AM"
  if (Number(hour2) > 12) {
    ampm = "PM"
    hour2 = Number(hour2) - 12
  }
  var min2 = String(a2.getMinutes()).padStart(2, '0');
  var sec2 = a2.getSeconds();

  let theDuration = arg[1].timeOut.seconds - arg[1].timeIn.seconds;
  if (date == date2) {
    cell1.innerHTML = month + '/' + date + '/' + year;
  }else{
    cell1.innerHTML = month + '/' + date + '/' + year + ' - ' + month2 + '/' + date2 + '/' + year2;
  }

  cell2.innerHTML = hour + ':' + min + ' ' + ampm;
  cell3.innerHTML = hour2 + ':' + min2 + ' ' + ampm2;
  cell4.innerHTML = (theDuration/3600).toFixed(2) + ' hours';
  cell5.innerHTML = arg[1].lockerRoomStatus[2] + '(' + arg[1].lockerRoomStatus[1] + ')';
  cell6.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal5' id='viewinfo"+arg[0]+"' type='button' class='btn btn-success'>View Info</button>";

  document.getElementById('viewinfo'+arg[0]).addEventListener('click', function(){
    viwingMore = true;
    document.getElementById('memberHistoryInfoNameTotal').innerHTML = memberCheckingInName
    document.getElementById('memberHistoryInfoNotes').value = arg[1].notes
  })
})

ipcRenderer.on('rank-request-return', (event, arg) => {
  rank = arg
  if (rank == '1') {
    editmemberInfoDeleteBtn.disabled = false
    editmemberInfoDeleteBtn.style.display = ''
    editmemberInfoDeleteBtn.addEventListener('click', function(){
      editmemberInfoName.innerHTML = memberEditingName;
    })
    editmemberInfoDeleteBtnCloseConfirm.addEventListener('click', function(){
      ipcRenderer.send('membership-delete', memberEditing)
    })
  }else {
    editmemberInfoDeleteBtn.disabled = true
    editmemberInfoDeleteBtn.style.display = 'none'
  }
})