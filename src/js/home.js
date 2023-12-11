var Tablesort = require('tablesort');
let pageDetails = document.getElementById('pageDetails')
let welcomeMsg = document.getElementById('welcomeMsg')
let welcomeMsg2 = document.getElementById('welcomeMsg2')
let activityTable = document.getElementById('activityTable')
let renewTxt = document.getElementById('renewTxt');
let checkInMember = document.getElementById('checkInMember');
let checkInMember2 = document.getElementById('checkInMember2');
let addLockerRoom = document.getElementById('addLockerRoom');
let addLockerRoomTxt = document.getElementById('addLockerRoomTxt');
let addLockerRoomTxt2 = document.getElementById('addLockerRoomTxt2');
let addLockerRoom2Cancel = document.getElementById('addLockerRoom2Cancel');
let addLockerRoomInput = document.getElementById('addLockerRoomInput');
let addLockerRoomSelect = document.getElementById('addLockerRoomSelect');
let activityInfoName = document.getElementById('activityInfoName');
let activityInfoType = document.getElementById('activityInfoType');
let activityInfoTimeIn = document.getElementById('activityInfoTimeIn');
let activityInfoRentalInfo = document.getElementById('activityInfoRentalInfo');
let activityInfoNotes = document.getElementById('activityInfoNotes');
let confirmCheckoutName = document.getElementById('confirmCheckoutName');
let confirmCheckoutBtn = document.getElementById('confirmCheckoutBtn');
let confirmCheckoutCheck = document.getElementById('confirmCheckoutCheck');
let confirmCheckoutLbl = document.getElementById('confirmCheckoutLbl');
let confirmCheckoutLbl2 = document.getElementById('confirmCheckoutLbl2');
let confirmRenewName = document.getElementById('confirmRenewName');
let confirmRenewBtn = document.getElementById('confirmRenewBtn');
let editRentalInfoConfirmBtn = document.getElementById('editRentalInfoConfirmBtn');
let editRentalInfoBtn = document.getElementById('editRentalInfoBtn');
let editRentalInfoType = document.getElementById('editRentalInfoType');
let editRentalInfoNum = document.getElementById('editRentalInfoNum');
let editRentalInfoNotes = document.getElementById('editRentalInfoNotes');

let intervalId;
let intervalId1;
let intervalId2;
let timerArrays = Array();
let addLockerRoomMemberID;
let currentlyRenewing;
let currentlyCheckingOut;
let currCheckedIn = 0;
let currActivityViewing;
let currActivityViewingLS;
let currActivityViewingLT;
let currActivityViewingLN;
let currActivityViewingNotes;
let theRenewTime;
let theCheckoutMsg = "Member has all belongings"

function openMembership(){
  let memID = document.getElementById('lastCreatedID').innerHTML
  ipcRenderer.send('open-membership', memID)
}

if (editRentalInfoType) {
  ipcRenderer.send('rentals-request')
}

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })  
}

document.getElementById('testTable').style.display = 'none'

if (checkInMember) {
  checkInMember.style.display = 'none';
}

function startRental(arg){
  checkInMember.style.display = '';
  addLockerRoomMemberID = arg[0]
  addLockerRoomTxt.innerHTML = 'Add locker rental for ' + arg[2].name + '.'
  addLockerRoom.addEventListener('click', function(){
    ipcRenderer.send('activity-update-lockerroom', Array(addLockerRoomMemberID, addLockerRoomSelect.value, addLockerRoomInput.value));
  })
}

if(addLockerRoom2Cancel){
  addLockerRoom2Cancel.addEventListener('click', function(){
    checkInMember.style.display = 'none';
  })
}

if (confirmCheckoutBtn) {
  confirmCheckoutBtn.disabled = true;
  confirmCheckoutCheck.addEventListener('change', function(){
    if (confirmCheckoutCheck.checked) {
      confirmCheckoutBtn.disabled = false;
    }else{
      confirmCheckoutBtn.disabled = true;
    }
  })
  confirmCheckoutBtn.addEventListener('click', function(){
    if (confirmCheckoutCheck.checked) {
      ipcRenderer.send('activity-close', currentlyCheckingOut[0]);
      currentlyCheckingOut[1].style.display = 'none';
      confirmCheckoutCheck.checked = false;
      currentlyCheckingOut = null;
    }
  })
}

if (confirmRenewBtn) {
  confirmRenewBtn.addEventListener('click', function(){
    ipcRenderer.send('activity-renew', Array(currentlyRenewing[0], currentlyRenewing[1], currentlyRenewing[2]));
  })
}

if (document.getElementById('addToWaitlist')) {
  document.getElementById('addToWaitlist').addEventListener('click', function(){
    ipcRenderer.send('activity-change-waitlist', Array(currActivityViewing, true))
  })
}

if (document.getElementById('removeFromWaitlist')) {
  document.getElementById('removeFromWaitlist').addEventListener('click', function(){
    ipcRenderer.send('activity-change-waitlist', Array(currActivityViewing, false))
  })
}

if (document.getElementById('viewMemberBtn')) {
  document.getElementById('viewMemberBtn').addEventListener('click', function(){
    ipcRenderer.send('open-membership-activity', currActivityViewing)
  })
}

if (editRentalInfoBtn) {
  editRentalInfoBtn.addEventListener('click', function(){
    editRentalInfoType.value = currActivityViewingLT
    editRentalInfoNum.value = currActivityViewingLN
    editRentalInfoNotes.value = currActivityViewingNotes
  })
}

if (editRentalInfoConfirmBtn) {
  editRentalInfoConfirmBtn.addEventListener('click', function(){
    ipcRenderer.send('activity-edit', Array(currActivityViewing, editRentalInfoType.value, editRentalInfoNum.value, editRentalInfoNotes.value, currActivityViewingLS))
  })
}

if (welcomeMsg) {
  var current = new Date();
  let tDate = current.toLocaleDateString();
  let tTime = current.toLocaleTimeString();

  welcomeMsg2.innerHTML = "Today is " + tDate + ". The time is " + tTime;
  intervalId = window.setInterval(function(){
    var current = new Date();
    let tDate = current.toLocaleDateString();
    let tTime = current.toLocaleTimeString();

    welcomeMsg2.innerHTML = "Today is " + tDate + ". The time is " + tTime;
  }, 1000);
}

if (activityTable) {
  ipcRenderer.send('activity-request')
//  new Tablesort(activityTable);
}

ipcRenderer.on('activity-request-return-remove', (event, arg) => {
//  currCheckedIn = currCheckedIn - 1
//  pageDetails.innerHTML = 'Current checked-in members: ' + currCheckedIn;
})

ipcRenderer.on('activity-request-return-update', (event, arg) => {
  let row = document.getElementById('row'+arg[0]);
  let theTable = document.getElementById('activityTable');
  if (!arg[1].active || arg[1].goingInactive) {
    theTable.deleteRow(row.rowIndex);
    currCheckedIn = currCheckedIn - 1
    pageDetails.innerHTML = 'Current checked-in members: ' + currCheckedIn;
    let rows = document.getElementById("activityTable").rows;
    return
  }

  var cell1 = document.getElementById('lockerRoomNumCell'+arg[0]);
  var cell2 = document.getElementById('lockerRoomCell'+arg[0]);
  var cell3 = document.getElementById('lnameCell'+arg[0]);
  var cell4 = document.getElementById('fnameCell'+arg[0]);
  var cell5 = document.getElementById('timeCell'+arg[0]);
  var cell6 = document.getElementById('buttonCell'+arg[0]);
  var cell7 = document.getElementById('iconCell'+arg[0]);
  cell1.outerHTML = "<th scope='row' id='lockerRoomNumCell"+arg[0]+"'>"+parseInt(arg[1].lockerRoomStatus[1])+"</th>"
  cell2.innerHTML = arg[1].lockerRoomStatus[2];

  if (arg[1].lockerRoomStatus[1] == 0) {
    row.style.backgroundColor = 'orange'
  }

  let currSeconds = Math.floor(Date.now() / 1000);
  let secondsInbetween = arg[1].lockerRoomStatus[5] - currSeconds;
  if (secondsInbetween <= 0) {
    let secondsInbetween = currSeconds - arg[1].lockerRoomStatus[5];
    printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8) + ' (Expired)';
  }else{
    printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8);
  }
  cell5.innerHTML = printSeconds
  if (secondsInbetween > 300) {
    row.classList.remove('table-warning')
    row.classList.remove('table-danger')
  }
  if (secondsInbetween <= 300) {
    row.classList.add('table-warning')
  }
  if (secondsInbetween <= 0) {
    row.classList.add('table-danger')
  }

  timerArrays.forEach((item, i) => {
    if (item[0] == arg[0]) {
      window.clearInterval(item[1])
    }
  });

  intervalId2 = window.setInterval(function(){
    let currSeconds = Math.floor(Date.now() / 1000);
    let secondsInbetween = arg[1].lockerRoomStatus[5] - currSeconds;
    if (secondsInbetween <= 0) {
      let secondsInbetween = currSeconds - arg[1].lockerRoomStatus[5];
      printSeconds = "Expired: " + new Date(secondsInbetween * 1000).toISOString().substr(11, 8);
    }else{
      printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8);
    }
    cell5.innerHTML = printSeconds
    if (secondsInbetween <= 300) {
      row.classList.add('table-warning')
    }
    if (secondsInbetween <= 0) {
      row.classList.add('table-danger')
    }
  }, 1000);
  timerArrays.push(Array(arg[0], intervalId2))

  document.getElementById('renew'+arg[0]).addEventListener('click', function(){
    document.getElementById('renew'+arg[0]).addEventListener('click', function(){
      confirmRenewName.innerHTML = arg[2].name;
      currentlyRenewing = Array(arg[0], arg[1].lockerRoomStatus, arg[3]);
    })
  })

  if (document.getElementById('waitlistbtn'+arg[0])) {
    document.getElementById('waitlistbtn'+arg[0]).addEventListener('click', function(){
      document.getElementById('viewinfo'+arg[0]).click()
    })
    if (arg[1].waitlist) {
      document.getElementById('waitlistbtn'+arg[0]).style.display = ""
      removeFromWaitlist.style.display = ""
      addToWaitlist.style.display = "none"
    }else{
      document.getElementById('waitlistbtn'+arg[0]).style.display = "none"
      removeFromWaitlist.style.display = "none"
      addToWaitlist.style.display = ""
    }
  }

  if (document.getElementById('outbtn'+arg[0])) {
    if (arg[1].currIn) {
      document.getElementById('outbtn'+arg[0]).style.display = ""
      document.getElementById('inbtn'+arg[0]).style.display = "none"
    }else{
      document.getElementById('outbtn'+arg[0]).style.display = "none"
      document.getElementById('inbtn'+arg[0]).style.display = ""
    }
  }

  document.getElementById('viewinfo'+arg[0]).addEventListener('click', function(){
    var a = new Date(arg[1].timeIn.seconds * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;

    activityInfoName.innerHTML = arg[2].name;
    activityInfoType.innerHTML = 'Membership Type: ' + arg[2].membership_type;
    activityInfoRentalInfo.innerHTML = 'Rental Type/Number: ' + arg[1].lockerRoomStatus[2] + ' (' + arg[1].lockerRoomStatus[1] + ')';
    activityInfoTimeIn.innerHTML = time;
    if (arg[1].notes) {
      activityInfoNotes.innerHTML = arg[1].notes;
    }else{
      activityInfoNotes.innerHTML = 'No notes found.';
    }

    currActivityViewing = arg[0];
    currActivityViewingLS = arg[1].lockerRoomStatus;
    currActivityViewingLT = arg[1].lockerRoomStatus[2];
    currActivityViewingLN = arg[1].lockerRoomStatus[1];
    currActivityViewingNotes = arg[1].notes;

    if (arg[1].waitlist) {
      document.getElementById('removeFromWaitlist').style.display = ""
      document.getElementById('addToWaitlist').style.display = "none"
    }else{
      document.getElementById('removeFromWaitlist').style.display = "none"
      document.getElementById('addToWaitlist').style.display = ""
    }
  })

  cell3.innerHTML = arg[2].lname;
  cell4.innerHTML = arg[2].fname;

  let rows = document.getElementById("activityTable").rows;
  pageDetails.innerHTML = 'Current checked-in members: ' + currCheckedIn;
})

ipcRenderer.on('home-checkoutmsg-return', (event, arg) => {
  console.log(arg);
  if (arg) {
    theCheckoutMsg = arg
    confirmCheckoutLbl.innerHTML = arg
  }
})

ipcRenderer.on('activity-request-return', (event, arg) => {
  if (!arg[1].active || arg[1].goingInactive) {
    return;
  }
  currCheckedIn = currCheckedIn + 1
  var row = activityTable.insertRow(1);
  row.id = 'row'+arg[0];
  var cell1 = row.insertCell(0);
  cell1.id = 'lockerRoomNumCell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'lockerRoomCell'+arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'lnameCell'+arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'fnameCell'+arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'timeCell'+arg[0];
  var cell6 = row.insertCell(5);
  cell6.id = 'buttonCell'+arg[0];
  var cell7 = row.insertCell(6);
  cell7.id = 'iconCell'+arg[0];

  row.setAttribute('memberid', arg[0]);
  if (arg[1].lockerRoomStatus[0]) {
    cell1.outerHTML = "<th scope='row' id='lockerRoomNumCell"+arg[0]+"'>"+parseInt(arg[1].lockerRoomStatus[1])+"</th>"
    cell2.innerHTML = arg[1].lockerRoomStatus[2];

    if (arg[1].lockerRoomStatus[1] == 0) {
      row.style.backgroundColor = 'orange'
    }

    let currSeconds = Math.floor(Date.now() / 1000);
    let secondsInbetween = arg[1].lockerRoomStatus[5] - currSeconds;
    if (secondsInbetween <= 0) {
      let secondsInbetween = currSeconds - arg[1].lockerRoomStatus[5];
      printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8) + ' (Expired)';
    }else{
      printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8);
    }
    cell5.innerHTML = printSeconds
    if (secondsInbetween <= 300) {
      row.classList.add('table-warning')
    }
    if (secondsInbetween <= 0) {
      row.classList.add('table-danger')
    }

    intervalId1 = window.setInterval(function(){
      let currSeconds = Math.floor(Date.now() / 1000);
      let secondsInbetween = arg[1].lockerRoomStatus[5] - currSeconds;
      if (secondsInbetween <= 0) {
        let secondsInbetween = currSeconds - arg[1].lockerRoomStatus[5];
        printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8) + ' (Expired)';
      }else{
        printSeconds = new Date(secondsInbetween * 1000).toISOString().substr(11, 8);
      }
      cell5.innerHTML = printSeconds
      if (secondsInbetween <= 300) {
        row.classList.add('table-warning')
      }
      if (secondsInbetween <= 0) {
        row.classList.add('table-danger')
      }
    }, 1000);
    timerArrays.push(Array(arg[0], intervalId1))

    cell6.innerHTML = "<button id='renew"+arg[0]+"' type='button' data-bs-toggle='modal' data-bs-target='#myModal4' class='btn btn-success'>Renew</button> <button data-bs-toggle='modal' data-bs-target='#myModal3' id='checkout"+arg[0]+"' type='button' class='btn btn-danger'>Check Out</button>  <button data-bs-toggle='modal' data-bs-target='#myModal2' id='viewinfo"+arg[0]+"' type='button' class='btn btn-primary'>View info</button>"
    cell7.innerHTML = "<button id='waitlistbtn"+arg[0]+"' type='button' class='btn btn-warning'><i class='fa-solid fa-clock'></i></button> <button id='outbtn"+arg[0]+"' type='button' class='btn btn-danger'><i class='fa-solid fa-person-walking-arrow-right'></i></button> <button id='inbtn"+arg[0]+"' type='button' class='btn btn-success'><i class='fa-solid fa-person-booth'></i></button>"
  }else{
    cell1.outerHTML = "<th scope='row'>N/A</th>"
    cell2.innerHTML = "N/A";
    cell5.innerHTML = "N/A"
    cell6.innerHTML = "<button id='addrental"+arg[0]+"' type='button' class='btn btn-primary'>Add Rental</button> <button data-bs-toggle='modal' data-bs-target='#myModal3' id='checkout"+arg[0]+"' type='button' class='btn btn-danger'>Check Out</button> <button data-bs-toggle='modal' data-bs-target='#myModal2' id='viewinfo"+arg[0]+"' type='button' class='btn btn-primary'>View info</button>"
    cell7.innerHTML = "<button id='waitlistbtn"+arg[0]+"' type='button' class='btn btn-warning'><i class='fa-solid fa-clock'></i></button> <button id='outbtn"+arg[0]+"' type='button' class='btn btn-danger'><i class='fa-solid fa-person-walking-arrow-right'></i></button> <button id='inbtn"+arg[0]+"' type='button' class='btn btn-success'><i class='fa-solid fa-person-booth'></i></button>"
    document.getElementById('addrental'+arg[0]).addEventListener('click', function(){
      startRental(arg);
    })
  }

  if (document.getElementById('waitlistbtn'+arg[0])) {
    document.getElementById('waitlistbtn'+arg[0]).addEventListener('click', function(){
      document.getElementById('viewinfo'+arg[0]).click()
    })
    if (arg[1].waitlist) {
      document.getElementById('waitlistbtn'+arg[0]).style.display = ""
    }else{
      document.getElementById('waitlistbtn'+arg[0]).style.display = "none"
    }
  }

  if (document.getElementById('outbtn'+arg[0])) {
    document.getElementById('outbtn'+arg[0]).addEventListener('click', function(){
      ipcRenderer.send('activity-change-inout', Array(arg[0], false))
    })
  }

  if (document.getElementById('inbtn'+arg[0])) {
    document.getElementById('inbtn'+arg[0]).addEventListener('click', function(){
      ipcRenderer.send('activity-change-inout', Array(arg[0], true))
    })
  }

  if (document.getElementById('outbtn'+arg[0])) {
    if (arg[1].currIn) {
      document.getElementById('outbtn'+arg[0]).style.display = ""
      document.getElementById('inbtn'+arg[0]).style.display = "none"
    }else{
      document.getElementById('outbtn'+arg[0]).style.display = "none"
      document.getElementById('inbtn'+arg[0]).style.display = ""
    }
  }

  document.getElementById('checkout'+arg[0]).addEventListener('click', function(){
    confirmCheckoutName.innerHTML = arg[2].name;
    currentlyCheckingOut = Array(arg[0], row);
    if (arg[1].lockerRoomStatus[2] == 'Room') {
      confirmCheckoutLbl .innerHTML = "Did you remember to get the remote?";
    }else{
      confirmCheckoutLbl .innerHTML = theCheckoutMsg;
    }
  })

  document.getElementById('renew'+arg[0]).addEventListener('click', function(){
    confirmRenewName.innerHTML = arg[2].name;
    currentlyRenewing = Array(arg[0], arg[1].lockerRoomStatus, arg[3]);
  })

  document.getElementById('viewinfo'+arg[0]).addEventListener('click', function(){
    var a = new Date(arg[1].timeIn.seconds * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;

    activityInfoName.innerHTML = arg[2].name;
    activityInfoType.innerHTML = 'Membership Type: ' + arg[2].membership_type;
    activityInfoRentalInfo.innerHTML = 'Rental Type/Number: ' + arg[1].lockerRoomStatus[2] + ' (' + arg[1].lockerRoomStatus[1] + ')';
    activityInfoTimeIn.innerHTML = time;
    if (arg[1].notes) {
      activityInfoNotes.innerHTML = arg[1].notes;
    }else{
      activityInfoNotes.innerHTML = 'No notes found.';
    }

    currActivityViewing = arg[0];
    currActivityViewingLS = arg[1].lockerRoomStatus;
    currActivityViewingLT = arg[1].lockerRoomStatus[2];
    currActivityViewingLN = arg[1].lockerRoomStatus[1];
    currActivityViewingNotes = arg[1].notes;

    if (arg[1].waitlist) {
      document.getElementById('removeFromWaitlist').style.display = ""
      document.getElementById('addToWaitlist').style.display = "none"
    }else{
      document.getElementById('removeFromWaitlist').style.display = "none"
      document.getElementById('addToWaitlist').style.display = ""
    }
  })

  cell3.innerHTML = arg[2].lname;
  cell4.innerHTML = arg[2].fname;

  let rows = document.getElementById("activityTable").rows;
  pageDetails.innerHTML = 'Current checked-in members: ' + currCheckedIn;
})

ipcRenderer.send('request-login-info')
ipcRenderer.on('recieve-login-info', (event, arg) => {
  welcomeMsg.innerHTML = "Welcome "+arg+"!";
})

ipcRenderer.on('rentals-request-return', (event, arg) => {
  var opt = document.createElement('option');
  opt.value = arg;
  opt.innerHTML = arg;
  editRentalInfoType.appendChild(opt);
})
