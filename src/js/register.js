var Tablesort = require('tablesort');
let personalRegOpen = document.getElementById('personalRegOpen');
let personalRegClose = document.getElementById('personalRegClose');
let personalRegDrop = document.getElementById('personalRegDrop');
let genReportBtn = document.getElementById('genReportBtn');
let genFinalReportBtn = document.getElementById('genFinalReportBtn');
let startingAmtContainer = document.getElementById('startingAmtContainer');
let startingAmt = document.getElementById('startingAmt');
let startingShift = document.getElementById('startingShift');
let startingSubmitBtn = document.getElementById('startingSubmitBtn');
let endingAmtContainer = document.getElementById('endingAmtContainer');
let endingExpAmt = document.getElementById('endingExpAmt');
let endingDiffAmt = document.getElementById('endingDiffAmt');
let endingCCardAmt = document.getElementById('endingCCardAmt');
let endingPSN = document.getElementById('endingPSN');
let endingPSA = document.getElementById('endingPSA');
let endingCCardAmtRan = document.getElementById('endingCCardAmtRan');
let dropAmtContainer = document.getElementById('dropAmtContainer');
let input100 = document.getElementById('input100');
let input50 = document.getElementById('input50');
let input20 = document.getElementById('input20');
let input10 = document.getElementById('input10');
let input5 = document.getElementById('input5');
let input1 = document.getElementById('input1');
let input25c = document.getElementById('input25c');
let input10c = document.getElementById('input10c');
let input5c = document.getElementById('input5c');
let input1c = document.getElementById('input1c');

let dinput100 = document.getElementById('dinput100');
let dinput50 = document.getElementById('dinput50');
let dinput20 = document.getElementById('dinput20');
let dinput10 = document.getElementById('dinput10');
let dinput5 = document.getElementById('dinput5');
let dinput1 = document.getElementById('dinput1');
let dinput25c = document.getElementById('dinput25c');
let dinput10c = document.getElementById('dinput10c');
let dinput5c = document.getElementById('dinput5c');
let dinput1c = document.getElementById('dinput1c');

let dropPSN = document.getElementById('dropPSN')
let dropPSA = document.getElementById('dropPSA')
let dropCCardAmtRan = document.getElementById('dropCCardAmtRan')
let dropCCardAmt = document.getElementById('dropCCardAmt')

let endingAmt = document.getElementById('endingAmt');
let dropAmt = document.getElementById('dropAmt');
let endingSubmitLogoutBtn = document.getElementById('endingSubmitLogoutBtn');
let endingSubmitBtn = document.getElementById('endingSubmitBtn');
let dropSubmitBtn = document.getElementById('dropSubmitBtn');
let manageRegisters = document.getElementById('manageRegisters');
let manageRegistersQB = document.getElementById('manageRegistersQB');
let groupQBInvoiceBtn = document.getElementById('groupQBInvoiceBtn');
let SAgroupQBInvoiceBtn = document.getElementById('SAgroupQBInvoiceBtn');
let registersTable = document.getElementById('registersTable');
let plrrBtn = document.getElementById('plrrBtn')

let theRegInfo;
let regsRequested = false

function editEndingTotal(){
  endingAmt.value = (Number(input100.value) * 100) + (Number(input50.value) * 50) + (Number(input20.value) * 20) + (Number(input10.value) * 10) + (Number(input5.value) * 5) + (Number(input1.value) * 1) + (Number(input25c.value) * .25) + (Number(input10c.value) * .10) + (Number(input5c.value) * .05) + (Number(input1c.value) * .01)   
  let endAmt = Number(endingAmt.value)
  let expAmt = Math.round((Number(endingExpAmt.value) + Number.EPSILON) * 100) / 100
  endingDiffAmt.value = Math.round(((endAmt - expAmt) + Number.EPSILON) * 100) / 100
}

function editDropTotal(){
  dropAmt.value = (Number(dinput100.value) * 100) + (Number(dinput50.value) * 50) + (Number(dinput20.value) * 20) + (Number(dinput10.value) * 10) + (Number(dinput5.value) * 5) + (Number(dinput1.value) * 1) + (Number(dinput25c.value) * .25) + (Number(dinput10c.value) * .10) + (Number(dinput5c.value) * .05) + (Number(dinput1c.value) * .01) + (Number(dropPSA.value))   
}

input100.addEventListener('input', function(){
  editEndingTotal()  
})

input50.addEventListener('input', function(){
  editEndingTotal()  
})

input20.addEventListener('input', function(){
  editEndingTotal()  
})

input10.addEventListener('input', function(){
  editEndingTotal()  
})

input5.addEventListener('input', function(){
  editEndingTotal()  
})

input1.addEventListener('input', function(){
  editEndingTotal()  
})

input25c.addEventListener('input', function(){
  editEndingTotal()  
})

input10c.addEventListener('input', function(){
  editEndingTotal()  
})

input5c.addEventListener('input', function(){
  editEndingTotal()  
})

input1c.addEventListener('input', function(){
  editEndingTotal()  
})

dinput100.addEventListener('input', function(){
  editDropTotal()
})

dinput50.addEventListener('input', function(){
  editDropTotal()
})

dinput20.addEventListener('input', function(){
  editDropTotal()
})

dinput10.addEventListener('input', function(){
  editDropTotal()
})

dinput5.addEventListener('input', function(){
  editDropTotal()
})

dinput1.addEventListener('input', function(){
  editDropTotal()
})

dinput25c.addEventListener('input', function(){
  editDropTotal()
})

dinput10c.addEventListener('input', function(){
  editDropTotal()
})

dinput5c.addEventListener('input', function(){
  editDropTotal()
})

dinput1c.addEventListener('input', function(){
  editDropTotal()  
})

dropPSA.addEventListener('input', function(){
  editDropTotal()
})

dropCCardAmt.addEventListener('input', function(){
  editDropTotal()
})

if (manageRegisters) {
  manageRegisters.style.display = 'none'
  manageRegistersQB.style.display = 'none'
}

if (personalRegOpen) {
  personalRegClose.style.display = 'none'
  personalRegDrop.style.display = 'none'
  ipcRenderer.send('register-status-request')
}

if (startingAmtContainer) {
  startingAmtContainer.style.display = 'none'
  endingAmtContainer.style.display = 'none'
  dropAmtContainer.style.display = 'none'
}

if (genReportBtn) {
  genReportBtn.addEventListener('click', function(){
    ipcRenderer.send('generate-report-now')
  })
}

if (genFinalReportBtn) {
  genFinalReportBtn.addEventListener('click', function(){
    ipcRenderer.send('generate-final-report-now')
  })
}

personalRegOpen.addEventListener('click', function(){
  startingAmtContainer.style.display = ''
  endingAmtContainer.style.display = 'none'
  dropAmtContainer.style.display = 'none'
  input100.focus()
})

personalRegClose.addEventListener('click', function(){
  startingAmtContainer.style.display = 'none'
  endingAmtContainer.style.display = ''
  dropAmtContainer.style.display = 'none'
  endingAmt.focus()
  endingExpAmt.value = Math.round((Number(theRegInfo.starting) + Number.EPSILON) * 100) / 100
})

personalRegDrop.addEventListener('click', function(){
  startingAmtContainer.style.display = 'none'
  endingAmtContainer.style.display = 'none'
  dropAmtContainer.style.display = ''
  dinput100.focus()
})

startingSubmitBtn.addEventListener('click', function(){
  ipcRenderer.send('starting-register', Array(startingAmt.value, startingShift.value))
})

endingSubmitLogoutBtn.addEventListener('click', function(){
  ipcRenderer.send('ending-register', Array(Array(endingAmt.value, Number(input100.value), Number(input50.value), Number(input20.value), Number(input10.value), Number(input5.value), Number(input1.value), Number(input25c.value), Number(input10c.value), Number(input5c.value), Number(input1c.value), Number(endingCCardAmt.value), Number(endingPSN.value), Number(endingPSA.value), Number(endingCCardAmtRan.value)), true))
})

endingSubmitBtn.addEventListener('click', function(){
  ipcRenderer.send('ending-register', Array(
    Array(
      endingAmt.value, 
      Number(input100.value), 
      Number(input50.value), 
      Number(input20.value), 
      Number(input10.value), 
      Number(input5.value), 
      Number(input1.value), 
      Number(input25c.value), 
      Number(input10c.value), 
      Number(input5c.value), 
      Number(input1c.value), 
      Number(endingCCardAmt.value), 
      Number(endingPSN.value), 
      Number(endingPSA.value), 
      Number(endingCCardAmtRan.value)
    ), 
    false,
    theRegInfo
  ))
})

dropSubmitBtn.addEventListener('click', function(){
  ipcRenderer.send('drop-register', Array(theRegInfo, dropAmt.value, Number(dinput100.value), Number(dinput50.value), Number(dinput20.value), Number(dinput10.value), Number(dinput5.value), Number(dinput1.value), Number(dinput25c.value), Number(dinput10c.value), Number(dinput5c.value), Number(dinput1c.value), Number(dropPSN.value), Number(dropPSA.value), Number(dropCCardAmtRan.value), Number(dropCCardAmt.value)))
  ipcRenderer.send('drop-register', Array(theRegInfo, Array(dropAmt.value, Number(dinput100.value), Number(dinput50.value), Number(dinput20.value), Number(dinput10.value), Number(dinput5.value), Number(dinput1.value), Number(dinput25c.value), Number(dinput10c.value), Number(dinput5c.value), Number(dinput1c.value), Number(dropPSN.value), Number(dropPSA.value), Number(dropCCardAmtRan.value), Number(dropCCardAmt.value))))
})

plrrBtn.addEventListener('click', function(){
  ipcRenderer.send('print-last-register-receipt')
})

let registerQbRequest = false
ipcRenderer.on('register-status-change', (event, arg) => {
  if (arg[0]) {
    personalRegOpen.style.display = 'none'
    personalRegClose.style.display = ''
    personalRegDrop.style.display = ''
    theRegInfo = arg[2]
  }else{
    personalRegOpen.style.display = ''
    personalRegClose.style.display = 'none'
    personalRegDrop.style.display = 'none'
  }
  if (arg[1][0]) {
    manageRegisters.style.display = ''
    if (arg[1][1]) {
      manageRegistersQB.style.display = ''      
      if (!registerQbRequest) {
        ipcRenderer.send('register-qb-request')        
        registerQbRequest = true
      }
    }
    if (!regsRequested) {
      ipcRenderer.send('register-all-request')
      regsRequested = true      
    }
  } else {
    manageRegisters.style.display = 'none'
  }
})

ipcRenderer.on('register-shift-times-return', (event, arg) => {
  document.getElementById('shiftA').innerHTML = arg[0]
  document.getElementById('shiftB').innerHTML = arg[1]
  document.getElementById('shiftC').innerHTML = arg[2]
})

let selectedRegsForInvoice = Array()

if (document.getElementById('testTable')) {
  document.getElementById('testTable').style.display = 'none'
}

if (registersTable) {
  new Tablesort(registersTable);
}

ipcRenderer.on('register-qb-request-return', (event, arg) => {
  registerQbRequest = false
  console.log(arg);
  var row = registersTable.insertRow(1);
  row.id = 'row' + arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'selectcell' + arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'datecell' + arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'cashiercell' + arg[0];
  var cell4 = row.insertCell(3);
  cell4.id = 'shiftcell' + arg[0];
  var cell5 = row.insertCell(4);
  cell5.id = 'actioncell' + arg[0];

  /*
            <th scope="row"><input class="form-check-input" type="checkbox" value=""></th>
            <td>08/01/2024</td>
            <td>Matthew Striks</td>
            <td>A Shift</td>
            <td><button class="btn btn-success">Create Invoice</button></td>
  */

  let theShift = 'No Shift Assigned'
  if (arg[1].shift == 'B') {
    theShift = arg[2][1]
  } else if (arg[1].shift == 'C') {
    theShift = arg[2][2]
  } else if (arg[1].shift == 'A') {
    theShift = arg[2][0]
  }

  cell1.innerHTML = '<input id="' + arg[0] + 'check" class="form-check-input" type="checkbox" value=""></input>'
  cell2.innerHTML = getTimestampString(new Date(arg[1].timestampStart.seconds * 1000), false)
  cell3.innerHTML = arg[1].uname
  cell4.innerHTML = theShift
  cell5.innerHTML = '<button id="' + arg[0] + 'CIBtn" class="btn btn-success">Create Invoice</button>'

  document.getElementById(arg[0] + 'check').addEventListener('change', function(){
    console.log('check clicked!');
    if (document.getElementById(arg[0] + 'check').checked && !selectedRegsForInvoice.includes(arg[0])) {
      selectedRegsForInvoice.push(arg[0])
    } else if (!document.getElementById(arg[0] + 'check').checked && selectedRegsForInvoice.includes(arg[0])) {
      for (let index = 0; index < selectedRegsForInvoice.length; index++) {
        const selectedReg = selectedRegsForInvoice[index];
        if (selectedReg == arg[0]) {
          selectedRegsForInvoice.splice(index, 1)
        }
      }
    }
  })

  document.getElementById(arg[0] +'CIBtn').addEventListener('click', function(){
    ipcRenderer.send('create-invoice-reg', arg[0])
  })
})

groupQBInvoiceBtn.addEventListener('click', function(){
  ipcRenderer.send('create-invoice-regs', selectedRegsForInvoice)
  selectedRegsForInvoice = Array()
})

SAgroupQBInvoiceBtn.addEventListener('click', function () {
  let theDocs = Array.from(document.getElementsByClassName('form-check-input'));
  theDocs.forEach(docu => {
    docu.checked = true;
  });
});

ipcRenderer.on('register-all-request-return', (event, arg) => {
  let newCard = document.createElement('div')
  newCard.setAttribute("regID", arg[0])
  newCard.className = 'card'
  newCard.id = arg[0] + 'newCard'

  currentRegisterCard = newCard

  let theShift = 'No Shift Assigned'
  if (arg[1].shift == 'B') {
    theShift = arg[2][1]
  } else if (arg[1].shift == 'C') {
    theShift = arg[2][2]
  } else if (arg[1].shift == 'A') {
    theShift = arg[2][0]
  }

  let cardHeader = document.createElement('div')
  cardHeader.className = 'card-header'
  cardHeader.innerHTML = theShift
  cardHeader.id = arg[0] + 'cardHeader'

  let cardBody = document.createElement('div')
  cardBody.className = 'card-body'
  cardBody.id = arg[0] + 'cardBody'

  let cardTitle = document.createElement('h5')
  cardTitle.innerHTML = arg[1].uname
  cardTitle.id = arg[0] + 'cardTitle'

  let cardEndingDiv = document.createElement('div')
  cardEndingDiv.className = 'container'
  cardEndingDiv.id = arg[0] + 'cardEndingDiv'

  let cardText = document.createElement('p')
  cardText.className = 'card-text'
  cardText.innerHTML = 'Ending Register Amount'
  cardText.id = arg[0] + 'cardText'

  let cardInput = document.createElement('input')
  cardInput.className = 'form-control'
  cardInput.setAttribute('type', 'number')
  cardInput.setAttribute('name', '')
  cardInput.setAttribute('value', '0')
  cardInput.id = arg[0] + 'cardInput'

  let cardButton = document.createElement('button')
  cardButton.className = 'btn btn-danger'
  cardButton.innerHTML = 'Close Register'
  cardButton.setAttribute('type', 'button')
  cardButton.setAttribute('name', 'button')
  cardButton.id = arg[0] + 'cardButton'

  let endBreak = document.createElement('br')
  let endBreak2 = document.createElement('br')

  manageRegisters.appendChild(newCard)
  newCard.appendChild(cardHeader)
  newCard.appendChild(cardBody)
  cardBody.appendChild(cardTitle)
  cardBody.appendChild(cardEndingDiv)
  cardEndingDiv.appendChild(cardText)
  cardEndingDiv.appendChild(cardInput)
  cardEndingDiv.appendChild(endBreak)
  cardEndingDiv.appendChild(cardButton)
  manageRegisters.appendChild(endBreak2)

  document.getElementById(arg[0] + 'cardButton').addEventListener('click', function(){
    ipcRenderer.send('manage-ending-register', Array(arg[0], document.getElementById(arg[0] + 'cardInput').value, arg[1].uid))
  })


  /*
      <div class="card">
        <div class="card-header">
          Shift
        </div>
        <div class="card-body">
          <h5 class="card-title">User</h5>
          <div class="container">
           <p class="card-text">Ending Register Amount</p>
            <input id="manageEndingAmt" class="form-control" type="number" name="" value="0">
          </div>
          <br>
            <button class="btn btn-warning" type="button" name="button" id="manageEndingBtn">Close</button>
        </div>
      </div>
  */



})
