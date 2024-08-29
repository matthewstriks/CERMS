var Tablesort = require('tablesort');
let activityBtn = document.getElementById('activityBtn');
let ordersBtn = document.getElementById('ordersBtn');
let activityDiv = document.getElementById('activityDiv');
let ordersDiv = document.getElementById('ordersDiv');
let membershipSearch = document.getElementById('membershipSearch');
let membershipSearchType = document.getElementById('membershipSearchType');
let orderSearch = document.getElementById('orderSearch');
let orderSearchType = document.getElementById('orderSearchType');
let membershipTable = document.getElementById('membershipTable');
let membershipOrderTable = document.getElementById('membershipOrderTable');
let vdOrderConfirm = document.getElementById('vdOrderConfirm');

let theEditingOrderID;

let enterPressed = false;

if (document.getElementById('testTable')) {
  document.getElementById('testTable').style.display = 'none'
}

if (activityDiv) {
//  activityDiv.style.display = 'none'
  ordersDiv.style.display = 'none'
}

if (activityBtn) {
  activityBtn.addEventListener('click', function(){
    activityDiv.style.display = ''
    ordersDiv.style.display = 'none'
  })
}

if (ordersBtn) {
  ordersBtn.addEventListener('click', function(){
    activityDiv.style.display = 'none'
    ordersDiv.style.display = ''
  })
}

if (membershipTable) {
  ipcRenderer.send('history-request')
  setTimeout(() => {
    new Tablesort(membershipTable);
    new Tablesort(membershipOrderTable);    
  }, 5000);
}

if(membershipSearch){
  membershipSearch.focus();
  membershipSearch.addEventListener("keydown", function (e) {
    if (e.code === "Enter") {
      enterPressed = true;
      var filter, tr, td, i, txtValue;
      filter = membershipSearch.value.toUpperCase();
      tr = membershipTable.getElementsByTagName("tr");
      ipcRenderer.send('history-search', Array(membershipSearch.value, membershipSearchType.value))
      let theRows = 1;
      var table = document.getElementById("membershipTable");
      var rowCount = table.rows.length;
      for (var i = theRows; i < rowCount; i++) {
        table.deleteRow(theRows);
      }
      for (i = 0; i < tr.length; i++) {
        if (membershipSearch.value == '') {
          enterPressed = false;
          tr[i].style.display = "";
        }
        if (tr[i].id == membershipSearch.value || tr[i].id == 'header' || tr[i].getAttribute("memberid") == membershipSearch.value) {
          tr[i].style.display = "";
        }else{
          tr[i].style.display = "none";
        }
      }
    }
  });
}

if (orderSearch){
  orderSearch.addEventListener("keydown", function (e) {
    if (e.code === "Enter") {
      enterPressed = true;
      var filter, tr, td, i, txtValue;
      filter = orderSearch.value.toUpperCase();
      tr = membershipOrderTable.getElementsByTagName("tr");
      ipcRenderer.send('order-search', Array(orderSearch.value, orderSearchType.value))
      let theRows = 1;
      var table = document.getElementById("membershipOrderTable");
      var rowCount = table.rows.length;
      for (var i = theRows; i < rowCount; i++) {
        table.deleteRow(theRows);
      }
      for (i = 0; i < tr.length; i++) {
        if (orderSearch.value == '') {
          enterPressed = false;
          tr[i].style.display = "";
        }
        if (tr[i].id == orderSearch.value || tr[i].id == 'header' || tr[i].getAttribute("orderid") == orderSearch.value) {
          tr[i].style.display = "";
        }else{
          tr[i].style.display = "none";
        }
      }
    }
  });
}

if (vdOrderConfirm) {
  vdOrderConfirm.addEventListener('click', function () {
    ipcRenderer.send('void-delete-order', theEditingOrderID)
  })
}

function membershipSearchFunct() {
  var filter, tr, td, i, txtValue;
  filter = membershipSearch.value.toUpperCase();
  tr = membershipTable.getElementsByTagName("tr");
  for (i = 0; i < tr.length; i++) {
    td = tr[i].getElementsByTagName("td")[0];
    td2 = tr[i].getElementsByTagName("td")[1];
    if (td) {
      txtValue = td.textContent || td.innerText;
      txtValue2 = td2.textContent || td2.innerText;
      if (!enterPressed) {
        if (txtValue.toUpperCase().indexOf(filter) > -1 || txtValue2.toUpperCase().indexOf(filter) > -1) {
          tr[i].style.display = "";
        } else {
          tr[i].style.display = "none";
        }
      }else{
        if (txtValue == "") {
          enterPressed = false;
        }
      }
    }
  }
}

function orderSearchFunct() {
  var filter, tr, td, i, txtValue;
  filter = orderSearch.value.toUpperCase();
  tr = membershipOrderTable.getElementsByTagName("tr");
  for (i = 0; i < tr.length; i++) {
    td = tr[i].getElementsByTagName("td")[0];
    td2 = tr[i].getElementsByTagName("td")[1];
    td3 = tr[i].getElementsByTagName("td")[3];
    if (td) {
      txtValue = td.textContent || td.innerText;
      txtValue2 = td2.textContent || td2.innerText;
      txtValue3 = td3.textContent || td3.innerText;
      if (!enterPressed) {
        if (txtValue.toUpperCase().indexOf(filter) > -1 || txtValue2.toUpperCase().indexOf(filter) > -1 || txtValue3.toUpperCase().indexOf(filter) > -1) {
          tr[i].style.display = "";
        } else {
          tr[i].style.display = "none";
        }
      }else{
        if (txtValue == "") {
          enterPressed = false;
        }
      }
    }
  }
}

ipcRenderer.on('history-order-request-return', (event, arg) => {
  var row = membershipOrderTable.insertRow(1);
  row.id = 'row' + arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'ordercell' + arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'dateinfo' + arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'amountout' + arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'customercell' + arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'buttoncell' + arg[0];

  var a = new Date(arg[1].timestamp['seconds'] * 1000);
  var year = a.getFullYear();
  var month = a.getMonth() + 1;
  var date = a.getDate();
  let hour = String(a.getHours()).padStart(2, '0');
  let ampm = "AM"
  if (hour > 12) {
    ampm = "PM"
    hour = hour - 12
  }else if(hour == 12){
    ampm = "PM"
  }
  var min = String(a.getMinutes()).padStart(2, '0');
  var sec = String(a.getSeconds()).padStart(2, '0');
  var time = month + '/' + date + '/' + year + ' ' + hour + ':' + min + ':' + sec + ' ' + ampm;

  row.setAttribute('activityid', arg[0]);
  cell1.innerHTML = arg[0];
  cell2.innerHTML = time;
  cell3.innerHTML = formatter.format(arg[1].total[2]);
  cell4.innerHTML = 'N/A'
  if (arg[2]) {
    cell4.innerHTML = arg[2].name    
  }
  if (arg[1].customerID) {
    cell5.innerHTML = "<button id='viewmemberbtn" + arg[0] + "' class='btn btn-primary' type='button'>View Member</button>";        
  }

  cell5.innerHTML = cell5.innerHTML + " <button id='vieworderbtn" + arg[0] + "' class='btn btn-primary' type='button'>View Order</button> <button data-bs-toggle='modal' data-bs-target='#myModal' id='deleteorderbtn" + arg[0] + "' class='btn btn-danger'>Void/Delete Order</button>"

  if (document.getElementById("viewmemberbtn" + arg[0])) {
    document.getElementById("viewmemberbtn" + arg[0]).addEventListener('click', function () {
      ipcRenderer.send('open-membership', arg[1].customerID)
    })    
  }

  if (document.getElementById("vieworderbtn" + arg[0])) {
    document.getElementById("vieworderbtn" + arg[0]).addEventListener('click', function () {
      ipcRenderer.send('open-reciept', arg[0])
    })    
  }

  if (document.getElementById('deleteorderbtn' + arg[0])) {
    document.getElementById('deleteorderbtn' + arg[0]).addEventListener('click', function(){
      theEditingOrderID = arg[0]
    })
  }
})

ipcRenderer.on('history-request-return', (event, arg) => {
  var row = membershipTable.insertRow(1);
  row.id = 'row'+arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'namecell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'rentalinfo'+arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'timein'+arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'timeout'+arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'timeduration'+arg[0];
  var cell6 = row.insertCell(5);
  cell6.id = 'buttoncell'+arg[0];

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
  var time = month + ' ' + date + ' ' + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;

  var a2 = new Date(arg[1].timeOut.seconds * 1000);
  var year2 = a2.getFullYear();
  var month2 = a2.getMonth()+1;
  var fancyMonth2 = months[a2.getMonth()];
  var date2 = a2.getDate();
  let hour2 = String(a2.getHours()).padStart(2, '0');
  let ampm2 = "AM"
  if (hour2 > 12) {
    ampm2 = "PM"
    hour2 = hour2 - 12
  }
  var min2 = String(a2.getMinutes()).padStart(2, '0');
  var sec2 = a2.getSeconds();

  let theDuration = (arg[1].timeOut.seconds - arg[1].timeIn.seconds);
  let theDurationTxt = (theDuration / 3600).toFixed(2) + ' hours'
  let theInDate;
  let theOutDate;
  if (date == date2) {
    theInDate = month + '/' + date + '/' + year + ' ' + hour + ':' + min + ' ' + ampm
    theOutDate = hour2 + ':' + min2 + ' ' + ampm2
  }else{
    theInDate = month + '/' + date + '/' + year + ' ' + hour + ':' + min + ' ' + ampm
    theOutDate = month2 + '/' + date2 + '/' + year2 + ' ' + hour2 + ':' + min2 + ' ' + ampm2
  }

  row.setAttribute('activityid', arg[0]);
  cell1.innerHTML = arg[2].fname + ' ' + arg[2].lname;
  cell2.innerHTML = arg[1].lockerRoomStatus[2] + ' ' + arg[1].lockerRoomStatus[1];
  cell3.innerHTML = theInDate
  cell4.innerHTML = theOutDate
  cell5.innerHTML = theDurationTxt;
  cell6.innerHTML = "<button id='viewmemberbtn"+arg[0]+"' class='btn btn-primary' type='button'>View Member</button>";

  document.getElementById("viewmemberbtn"+arg[0]).addEventListener('click', function(){
    ipcRenderer.send('open-membership', arg[1].memberID)
  })
})

ipcRenderer.on('history-request-remove', (event, arg) => {
  if (document.getElementById('row' + arg)) {
    document.getElementById('row' + arg).remove()
  }
})