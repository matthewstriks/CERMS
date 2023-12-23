let personalRegOpen = document.getElementById('personalRegOpen');
let personalRegClose = document.getElementById('personalRegClose');
let personalRegDrop = document.getElementById('personalRegDrop');
let genReportBtn = document.getElementById('genReportBtn');
let startingAmtContainer = document.getElementById('startingAmtContainer');
let startingAmt = document.getElementById('startingAmt');
let startingShift = document.getElementById('startingShift');
let startingSubmitBtn = document.getElementById('startingSubmitBtn');
let endingAmtContainer = document.getElementById('endingAmtContainer');
let endingExpAmt = document.getElementById('endingExpAmt');
let endingDiffAmt = document.getElementById('endingDiffAmt');
let endingCCardAmt = document.getElementById('endingCCardAmt');
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

let endingAmt = document.getElementById('endingAmt');
let dropAmt = document.getElementById('dropAmt');
let endingSubmitLogoutBtn = document.getElementById('endingSubmitLogoutBtn');
let endingSubmitBtn = document.getElementById('endingSubmitBtn');
let dropSubmitBtn = document.getElementById('dropSubmitBtn');
let manageRegisters = document.getElementById('manageRegisters');

let theRegInfo;

function editEndingTotal(){
  endingAmt.value = (Number(input100.value) * 100) + (Number(input50.value) * 50) + (Number(input20.value) * 20) + (Number(input10.value) * 10) + (Number(input5.value) * 5) + (Number(input1.value) * 1) + (Number(input25c.value) * .25) + (Number(input10c.value) * .10) + (Number(input5c.value) * .05) + (Number(input1c.value) * .01)   
  let endAmt = Number(endingAmt.value)
  let expAmt = Math.round((Number(endingExpAmt.value) + Number.EPSILON) * 100) / 100
  endingDiffAmt.value = (endAmt - expAmt)
}

function editDropTotal(){
  dropAmt.value = (Number(dinput100.value) * 100) + (Number(dinput50.value) * 50) + (Number(dinput20.value) * 20) + (Number(dinput10.value) * 10) + (Number(dinput5.value) * 5) + (Number(dinput1.value) * 1) + (Number(dinput25c.value) * .25) + (Number(dinput10c.value) * .10) + (Number(dinput5c.value) * .05) + (Number(dinput1c.value) * .01)   
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

if (manageRegisters) {
  manageRegisters.style.display = 'none'
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
  ipcRenderer.send('ending-register', Array(Array(endingAmt.value, Number(input100.value), Number(input50.value), Number(input20.value), Number(input10.value), Number(input5.value), Number(input1.value), Number(input25c.value), Number(input10c.value), Number(input5c.value), Number(input1c.value), Number(endingCCardAmt.value)), true))
})

endingSubmitBtn.addEventListener('click', function(){
  ipcRenderer.send('ending-register', Array(Array(endingAmt.value, Number(input100.value), Number(input50.value), Number(input20.value), Number(input10.value), Number(input5.value), Number(input1.value), Number(input25c.value), Number(input10c.value), Number(input5c.value), Number(input1c.value), Number(endingCCardAmt.value)), false))
})

dropSubmitBtn.addEventListener('click', function(){
  ipcRenderer.send('drop-register', Array(theRegInfo, dropAmt.value, Number(dinput100.value), Number(dinput50.value), Number(dinput20.value), Number(dinput10.value), Number(dinput5.value), Number(dinput1.value), Number(dinput25c.value), Number(dinput10c.value), Number(dinput5c.value), Number(dinput1c.value)))
})

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
  if (arg[1]) {
    manageRegisters.style.display = ''
    ipcRenderer.send('register-all-request')
  } else {
    manageRegisters.style.display = 'none'
  }
})

ipcRenderer.on('register-shift-times-return', (event, arg) => {
  document.getElementById('shiftA').innerHTML = arg[0]
  document.getElementById('shiftB').innerHTML = arg[1]
  document.getElementById('shiftC').innerHTML = arg[2]
})

ipcRenderer.on('register-all-request-return', (event, arg) => {
  let newCard = document.createElement('div')
  newCard.setAttribute("regID", arg[0])
  newCard.className = 'card'
  newCard.id = arg[0] + 'newCard'

  currentRegisterCard = newCard

  let theShift = 'No Shift Assigned'
  if (arg[1].shift == 'b') {
    theShift = '7am - 3pm'
  } else if (arg[1].shift == 'c') {
    theShift = '3pm - 11pm'
  } else if (arg[1].shift == 'a') {
    theShift = '11pm - 7am'
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
