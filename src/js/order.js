const { ipcRenderer } = require('electron')
let logoutBtn = document.getElementById('logoutBtn');
let productSection = document.getElementById('productSection');
let customerName = document.getElementById('customerName');
let checkoutCustomerInfo = document.getElementById('checkoutCustomerInfo');
let clearBtn = document.getElementById('clearBtn');
let resumeBtn = document.getElementById('resumeBtn');
let suspendBtn = document.getElementById('suspendBtn');
let checkoutBtn = document.getElementById('checkoutBtn');
let productCheckoutList = document.getElementById('productCheckoutList');
let finishOrderBtn = document.getElementById('finishOrderBtn');
let noRecieptBtn = document.getElementById('noRecieptBtn');
let printBtn = document.getElementById('printBtn');
let emailBtn = document.getElementById('emailBtn');
let printEmailBtn = document.getElementById('printEmailBtn');
let membersEmailInputTxt = document.getElementById('membersEmailInputTxt');
let membersEmailInput = document.getElementById('membersEmailInput');
let printEmailCompleteBtn = document.getElementById('printEmailCompleteBtn');
let cdCardEnter = document.getElementById('cdCardEnter');
let gCardEnter = document.getElementById('gCardEnter');
let cashEnter = document.getElementById('cashEnter');
let totalLeft = document.getElementById('totalLeft');
let changeBack = document.getElementById('changeBack');
let discountWarning = document.getElementById('discountWarning');
let orderDiscount = document.getElementById('orderDiscount');
let orderDiscountBtn = document.getElementById('orderDiscountBtn');
let removeDiscountBtn = document.getElementById('removeDiscountBtn');
let modal3Body = document.getElementById('modal3Body');
let modal3Body2 = document.getElementById('modal3Body2');
let addLockerRoomInput = document.getElementById('addLockerRoomInput');
let addLockerRoomInput2 = document.getElementById('addLockerRoomInput2');
let completeCheckIn = document.getElementById('completeCheckIn');
let productListSearch = document.getElementById('productListSearch');
let searchProducts = document.getElementById('searchProducts');

let accordionFavoriteheadingZero = document.getElementById('accordionFavoriteheadingZero');
let favoriteProductCardRow = document.getElementById('favoriteProductCardRow');

let totalLeftAmt;
let ran = false
let discountingOrder = false
let theCustomerInfo;

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (searchProducts) {
  searchProducts.addEventListener('click', function(){
    myInput.focus()
  })

  myInput.onkeypress = function (event) {
    if (event.key == 'Enter') {
      myInput.value = ""
    }
  };
}
let lastRanVal = ""
function filterFunction() {
  var input, filter, ul, li, a, i;
  input = document.getElementById("myInput");
  filter = input.value.toUpperCase();
  div = document.getElementById("myDropdown");
  a = div.getElementsByTagName("li");
  if (lastRanVal == filter) {
    return
  }
  lastRanVal = filter
  for (i = 0; i < a.length; i++) {
    txtValue = a[i].textContent || a[i].innerText || a[i].getAttribute('barcode');
    if (filter == a[i].getAttribute('barcode') && filter != "") {
      a[i].style.display = "";
      a[i].click()
      return
    } else {
      a[i].style.display = "none";
    }
    if ((txtValue.toUpperCase().indexOf(filter) > -1)) {
      a[i].style.display = "";
    } else {
      a[i].style.display = "none";
    }
    if (!ran || (filter == "")) {
      a[i].style.display = "none";
    }
  }
  ran = true
}

if (cashEnter) {
  cashEnter.addEventListener('dblclick', function(){
    cashEnter.value = totalLeftAmt
    updateOrderTotalPaid()
  })
}

if (cdCardEnter) {
  cdCardEnter.addEventListener('dblclick', function(){
    cdCardEnter.value = totalLeftAmt
    updateOrderTotalPaid()
  })
}

if (gCardEnter) {
  gCardEnter.addEventListener('dblclick', function(){
    gCardEnter.value = totalLeftAmt
    updateOrderTotalPaid()
  })
}

if (document.getElementById('myModal')) {
  document.getElementById('myModal').addEventListener('hidden.bs.modal', function() {
    productCheckoutList.innerHTML = ''
  })
}

let productsData
let categoryData
let productsSelected = Array()
let productsTotal = Array()
let discountsData;
let discountsSelected = false;
let theDiscountInfoArray = Array();
let productsSub;
let productsTax;
let productsTot;
let productsOGTot;
let theChange;
let theCustomerID;
let theCustomerEMail;
let recieptStyle;
let theProductID;

if (logoutBtn) {
  logoutBtn.addEventListener('click', function(){
    ipcRenderer.send('account-logout')
  })
}

if (document.getElementById('quickSaleBtn')) {
  document.getElementById('quickSaleBtn').addEventListener('click', function () {
    ipcRenderer.send('quick-sale')
  })
}

if (clearBtn) {
  clearBtn.addEventListener('click', function(){
    productsSelected = Array()
    productsTotal = Array()
    productSection.innerHTML = ''
    removeDiscountBtn.click()
    discountWarning.innerHTML = ''
  })
}

if (membersEmailInput) {
  membersEmailInputTxt.style.display = 'none'  
  membersEmailInput.style.display = 'none'  
}

if (printEmailCompleteBtn) {
  printEmailCompleteBtn.style.display = 'none'  
}

if (noRecieptBtn) {
  noRecieptBtn.addEventListener('click', function(){
    membersEmailInputTxt.style.display = 'none'  
    membersEmailInput.style.display = 'none'  
    printEmailCompleteBtn.style.display = 'none'  
    recieptStyle = 0
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), Number(theChange)), theDiscountInfoArray, recieptStyle, "", addLockerRoomInput.value, addLockerRoomInput2.value))
  })  
}

if (printBtn) {
  printBtn.addEventListener('click', function(){
    recieptStyle = 1
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), Number(theChange)), theDiscountInfoArray, recieptStyle, "", addLockerRoomInput.value, addLockerRoomInput2.value))
  })  
}

if (emailBtn) {
  emailBtn.addEventListener('click', function(){
    membersEmailInput.style.display = ''
    membersEmailInputTxt.style.display = ''
    printEmailCompleteBtn.style.display = ''
    if (theCustomerEMail) {
      membersEmailInputTxt.innerHTML = 'Is your email still...?'
      membersEmailInput.value = theCustomerEMail      
    } else {
      membersEmailInputTxt.innerHTML = 'What is your email for the reciept? (It will not be saved to membership)'
    }
    recieptStyle = 2
    //    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value)), theDiscountInfoArray, 2))
  })  
}

if (printEmailBtn) {
  printEmailBtn.addEventListener('click', function(){
    membersEmailInput.style.display = ''
    membersEmailInputTxt.style.display = ''
    printEmailCompleteBtn.style.display = ''  
    if (theCustomerEMail) {
      membersEmailInputTxt.innerHTML = 'Is your email still...?'
      membersEmailInput.value = theCustomerEMail
    } else {
      membersEmailInputTxt.innerHTML = 'What is your email for the reciept? (It will not be saved to membership)'
    }
    recieptStyle = 3
  })  
}

if (printEmailCompleteBtn) {
  printEmailCompleteBtn.addEventListener('click', function(){
    membersEmailInput.style.display = 'none'
    membersEmailInputTxt.style.display = 'none'
    printEmailCompleteBtn.style.display = 'none'
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), theChange), theDiscountInfoArray, recieptStyle, membersEmailInput.value, addLockerRoomInput.value, addLockerRoomInput2.value))  
  })
}

if (completeCheckIn) {
  completeCheckIn.addEventListener('click', function(){
    ipcRenderer.send('complete-rental-info-order', Array(addLockerRoomInput.value, addLockerRoomInput2.value))
  })
}

if (addLockerRoomInput) {
  addLockerRoomInput.addEventListener('change', function () {
    if (addLockerRoomInput.value == "") {
      completeCheckIn.disabled = true;
    } else {
      completeCheckIn.disabled = false;
    }
  })
}


if (finishOrderBtn) {
  finishOrderBtn.style.display = 'none'
}

function updateOrderTotalPaid(){
  let totalPaid = Number(cdCardEnter.value) + Number(gCardEnter.value) + Number(cashEnter.value)
  totalLeftAmt = (productsTot - totalPaid).toFixed(2)
  totalLeft.innerHTML = 'Total Left: ' + formatter.format(totalLeftAmt)
  if (Number(totalPaid.toFixed(2)) >= Number(productsTot.toFixed(2))) {
    theChange = totalLeftAmt
    finishOrderBtn.style.display = ''
  }else{
    finishOrderBtn.style.display = 'none'
  }
}

if (cdCardEnter) {
  cdCardEnter.addEventListener('input', function(){
    updateOrderTotalPaid()
  })
}

if (gCardEnter) {
  gCardEnter.addEventListener('input', function(){
    updateOrderTotalPaid()
  })
}
if (cashEnter) {
  cashEnter.addEventListener('input', function(){
    updateOrderTotalPaid()
  })
}

if (suspendBtn) {
  resumeBtn.style.display = 'none'
  suspendBtn.addEventListener('click', function(){
    resumeBtn.style.display = ''
    suspendBtn.style.display = 'none'
    ipcRenderer.send('suspend-order', Array(productsTotal))
  })
}

if (resumeBtn) {
  resumeBtn.addEventListener('click', function () {
    suspendBtn.style.display = ''
    resumeBtn.style.display = 'none'
    ipcRenderer.send('resume-order')
  })
}

if (checkoutBtn) {
  checkoutBtn.addEventListener('click', function(){
    productsSub = 0;
    productsTax = 0;
    productsTot = 0;
    productsOGTot = 0;
    theDiscountInfoArray = Array()
    let discountApplied = false;
    productsSelected.forEach((item, i) => {
      let currentProductCard = document.getElementById(item + 'newCard')
      let currQuantity = currentProductCard.getAttribute('quantity');
      let discountInfo = currentProductCard.getAttribute('discount')
      let discountInfoWaive = (currentProductCard.getAttribute('waived'))
      let theDiscountInfo;
      discountsData.forEach((discountItem, di) => {
        if (discountItem[0] == discountInfo){
          theDiscountInfo = discountItem
          theDiscountInfoArray.push(Array(item, discountInfo))
        } 
      })
      for (var i2 = 0; i2 < currQuantity; i2++) {
        productsData.forEach((item2, i3) => {
          if (item2[0] == item) {
            let newP = document.createElement('p')
            let theProductPrice = item2[1].price
            if (theDiscountInfo && !discountApplied) {
              if (theDiscountInfo[1].dollar) {
                theProductPrice = theProductPrice - theDiscountInfo[1].amount
                newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + formatter.format(theDiscountInfo[1].amount) + ' OFF ' + formatter.format(item2[1].price) + ')'                
                discountApplied = true
              } else {
                let thePer = (theDiscountInfo[1].amount / 100)
                let theOff = theProductPrice * thePer
                theProductPrice = theProductPrice - theOff
                newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + theDiscountInfo[1].amount + '% OFF ' + formatter.format(item2[1].price) + ')'                
                discountApplied = true
              }    
            } else{
              newP.innerHTML = item2[1].name + ' - ' + formatter.format(item2[1].price)
            } 
            if (discountInfoWaive == "1") {
              theProductPrice = 0
              newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (WAIVED)'
              discountApplied = true
            }    
            productCheckoutList.appendChild(newP)
            productsSub = productsSub + Number(theProductPrice)
            productsOGTot = productsOGTot + Number(theProductPrice)
          
            if (item2[1].taxable) {
              productsTax = productsTax + (Number(theProductPrice) * .07)              
            }
          }
        });
      }
    });

    if (discountsSelected && !discountApplied) {
      let disc = document.createElement('p')
      if (discountsSelected[1].dollar) {
        disc.innerHTML = 'Discount ' + discountsSelected[1].code + ': ' + formatter.format(discountsSelected[1].amount) + ' OFF'
        productsSub = productsSub - discountsSelected[1].amount
      }else if (discountsSelected[1].percent) {
        let thePer = (discountsSelected[1].amount / 100)
        let theOff = productsSub * thePer
        disc.innerHTML = 'Discount ' + discountsSelected[1].code + ': ' + discountsSelected[1].amount + '% OFF (' + formatter.format(theOff) + ')'
        productsSub = productsSub - theOff
      }
      productCheckoutList.appendChild(disc)
    }
    

    productsTot = (productsSub + productsTax)

    if (productsTot < 0) {
      productsTot = 0
    }    

    totalLeft.innerHTML = 'Total Left: ' + formatter.format(productsTot)
    updateOrderTotalPaid()

    let newBr = document.createElement('br')
    productCheckoutList.appendChild(newBr)

    let newP2 = document.createElement('p')
    newP2.innerHTML = 'Subtotal: ' + formatter.format(productsSub)
    productCheckoutList.appendChild(newP2)

    let newP3 = document.createElement('p')
    newP3.innerHTML = 'Tax: ' + formatter.format(productsTax)
    productCheckoutList.appendChild(newP3)

    let newP4 = document.createElement('p')
    newP4.innerHTML = 'Total: ' + formatter.format(productsTot)
    productCheckoutList.appendChild(newP4)
  })
}

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function addProductCard(theProduct){  
  let currentProductCard = document.getElementById(theProduct[0] + 'newCard')
  let currentProductCardInfo = document.getElementById(theProduct[0] + 'cardHeader')
  if (currentProductCard) {
    let currQuantity = currentProductCard.getAttribute('quantity');
    currQuantity = Number(currQuantity) + 1
    currentProductCard.setAttribute('quantity', currQuantity)
    currentProductCardInfo.innerHTML = theProduct[1].name + " - " + formatter.format(theProduct[1].price) + ' - x' + currQuantity + ' <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'    

    let plusBtn = document.getElementById(theProduct[0] + 'plus')
    if (plusBtn) {
      plusBtn.addEventListener('click', function () {
        addProductCard(theProduct)
        ipcRenderer.send('add-to-order', Array(theCustomerInfo, theProduct, addLockerRoomInput.value, addLockerRoomInput2.value))
      })
    }

    productsTotal.push(theProduct[0])
    return
  }
  productsSelected.push(theProduct[0])
  productsTotal.push(theProduct[0])
  let newCard = document.createElement('div')
  newCard.setAttribute("quantity", 1)
  newCard.setAttribute('waived', 0)
  newCard.className = 'card'
  newCard.id = theProduct[0] + 'newCard'

  currentProductCard = newCard

  let cardHeader = document.createElement('div')
  cardHeader.className = 'card-header'
  cardHeader.innerHTML = theProduct[1].name + " - " + formatter.format(theProduct[1].price) + ' - x1 <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'    
  cardHeader.id = theProduct[0] + 'cardHeader'

  let cardBody = document.createElement('div')
  cardBody.className = 'card-body'
  cardBody.id = theProduct[0] + 'cardBody'

  let cardInfo = document.createElement('p')
  cardInfo.innerHTML = '<a id="' + theProduct[0] + 'trash" href="#" class="btn btn-danger"><i class="fa-solid fa-trash"></i></a> <a class="btn btn-primary" href="#" id="' + theProduct[0] + 'startDiscount"><i class="fa-solid fa-tag"></i></a><p id="' + theProduct[0] + 'orderDiscountWarning" style="color:red"></p><input id = "' + theProduct[0] + 'orderDiscount" type = "text" class="form-control" placeholder = "Discount Code (case sensitive)"><button id="' + theProduct[0] + 'orderDiscountBtn" type="button" class="btn btn-success" name="button">Add discount to item</button><button id = "' + theProduct[0] + 'removeDiscountBtn" type = "button" class="btn btn-danger" name = "button" > Remove discount from item</button><button id = "' + theProduct[0] + 'waiveProductBtn" class="btn btn-warning" name="button">Waive Item</button>'
  cardInfo.id = theProduct[0] + 'cardInfo'

  let endBreak = document.createElement('br')

  productSection.appendChild(newCard)
  newCard.appendChild(cardHeader)
  newCard.appendChild(cardBody)
  cardBody.appendChild(cardInfo)
  productSection.appendChild(endBreak)

  let trashBtn = document.getElementById(theProduct[0] + 'trash')
  let sDiscountBtn = document.getElementById(theProduct[0] + 'startDiscount')
  let plusBtn = document.getElementById(theProduct[0] + 'plus')
  let productDiscountWarning = document.getElementById(theProduct[0] + 'orderDiscountWarning')
  let productDiscount = document.getElementById(theProduct[0] + 'orderDiscount')
  let productDiscountBtn = document.getElementById(theProduct[0] + 'orderDiscountBtn')
  let productWaiveBtn = document.getElementById(theProduct[0] + 'waiveProductBtn')
  let removeProductDiscountBtn = document.getElementById(theProduct[0] + 'removeDiscountBtn')

  if (removeProductDiscountBtn) {
    removeProductDiscountBtn.style.display = 'none'
    removeProductDiscountBtn.addEventListener('click', function(){
      removeProductDiscount(productDiscountWarning, productDiscount, productDiscountBtn, productWaiveBtn, removeProductDiscountBtn, newCard)
      productDiscount.style.display = 'none'
      productDiscountBtn.style.display = 'none'
      productWaiveBtn.style.display = 'none'
    })
  }

  if (sDiscountBtn) {
    productDiscount.style.display = 'none'
    productDiscountBtn.style.display = 'none'
    productWaiveBtn.style.display = 'none'
    sDiscountBtn.addEventListener('click', function(){
      productDiscount.style.display = ''
      productDiscountBtn.style.display = ''
      productWaiveBtn.style.display = ''
    })    
  }

  if (trashBtn) {
    trashBtn.addEventListener('click', function(){
      removeProductCard(theProduct)
    })
  }

  if (plusBtn) {
    plusBtn.addEventListener('click', function(){
      addProductCard(theProduct)
      ipcRenderer.send('add-to-order', Array(theCustomerInfo, theProduct, addLockerRoomInput.value, addLockerRoomInput2.value))
    })
  }

  if(productDiscountBtn){
    productDiscountBtn.addEventListener('click', function(){
      startProductDiscount(productDiscount.value, productDiscountWarning, productDiscount, productDiscountBtn, productWaiveBtn, removeProductDiscountBtn, currentProductCard)
    })
  }

  if(productWaiveBtn){
    productWaiveBtn.addEventListener('click', function(){
      startWaiveProduct(productDiscountWarning, productDiscount, productDiscountBtn, productWaiveBtn, removeProductDiscountBtn, currentProductCard)
    })
  }

  discountsData.forEach(discount => {
    if (discount[1].asCheck && (discount[1].asPro == theProduct[0])) {
      sDiscountBtn.style.display = "none"
      removeProductDiscountBtn.disabled = true
      startProductDiscount(discount[1].code, productDiscountWarning, productDiscount, productDiscountBtn, productWaiveBtn, removeProductDiscountBtn, currentProductCard)
    }
  });

}

function removeProductCard(theProduct){
  let currentProductCard = document.getElementById(theProduct[0] + 'newCard')
  let currentProductCardInfo = document.getElementById(theProduct[0] + 'cardHeader')
  if (currentProductCard) {
    let currQuantity = currentProductCard.getAttribute('quantity');
    currQuantity = Number(currQuantity) - 1
    productsSelected.forEach((item, i) => {
      if (theProduct[0] == item) {
        productsTotal.splice(i, 1)
        return
      }
    });
    if (currQuantity <= 0) {
      currentProductCard.remove()
      productsSelected.forEach((item, i) => {
        if (theProduct[0] == item) {
          productsSelected.splice(i, 1)
        }
      });
    }
    currentProductCard.setAttribute('quantity', currQuantity)
    currentProductCardInfo.innerHTML = theProduct[1].name + " - " + formatter.format(theProduct[1].price) + ' - x' + currQuantity + ' <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'
    return
  }
}

function startOrderDiscount(discountCode){
  let failReason = 'Discount does not exist!'
  let discountFound = false
  discountsSelected = false
  discountsData.forEach((item, i) => {
    if (discountCode == item[1].code) {
      if (item[1].expires <= Date.now()) {
        failReason = 'Discount Expired!'
        return
      }
      if (!item[1].typeOrder) {
        failReason = 'Discount only for single products!'
        return        
      }
      if ((item[1].limit) && (item[1].used >= item[1].limit)) {
        failReason = 'Discount has already been used ' + item[1].limit + ' time(s)'
        return
      }

      discountWarning.innerHTML = 'Discount applied!'
      discountWarning.style = 'color:green'
      orderDiscount.disabled = true
      orderDiscountBtn.disabled = true
      discountsSelected = item
      removeDiscountBtn.style.display = ''
      orderDiscountBtn.style.display = 'none'
      productWaiveBtn.style.display = 'none'
      discountFound = true
    }
  });
  if (!discountFound) {
    discountWarning.innerHTML = failReason
    discountWarning.style = 'color:red'
  }
}

function removeProductDiscount(theDiscountWarning, theOrderDiscount, theOrderDiscountBtn, theWaiveProductBtn, theRemoveDiscountBtn, theProductCard){
  discountFound = false
  discountsSelected = false
  theProductCard.setAttribute('discount', false)
  theProductCard.setAttribute('waived', 0)
  theDiscountWarning.innerHTML = 'Discount removed!'
  theDiscountWarning.style = 'color:red'
  theOrderDiscount.disabled = false
  theOrderDiscount.value = ""
  theOrderDiscountBtn.disabled = false
  theRemoveDiscountBtn.style.display = 'none'
  theOrderDiscountBtn.style.display = ''
  theWaiveProductBtn.style.display = ''
}

function startProductDiscount(discountCode, theDiscountWarning, theProductDiscount, theProductDiscountBtn, theProductWaiveBtn, theRemoveDiscountBtn, theProductCard){
  let failReason = 'Discount does not exist!'
  let discountFound = false
  discountsSelected = false
  discountsData.forEach((item, i) => {
    if (discountCode == item[1].code) {
      if (item[1].expires <= Date.now()) {
        failReason = 'Discount Expired!'
        return
      }
      if (!item[1].typeProduct) {
        failReason = 'Discount only for entire order!'
        return
      }
      theProductCard.setAttribute('discount', item[0])
      theDiscountWarning.innerHTML = 'Discount applied!'
      theDiscountWarning.style = 'color:green'
      theProductDiscount.disabled = true
      theProductDiscountBtn.disabled = true
      theRemoveDiscountBtn.style.display = ''
      theProductDiscountBtn.style.display = 'none'
      theProductWaiveBtn.style.display = 'none'
      discountFound = true
      discountsSelected = item
    }
  });
  if (!discountFound) {
    theDiscountWarning.innerHTML = failReason
    theDiscountWarning.style = 'color:red'
  }
}
function startWaiveProduct(theDiscountWarning, theProductDiscount, theProductDiscountBtn, theProductWaiveBtn, theRemoveDiscountBtn, theProductCard){
  theProductCard.setAttribute('waived', 1)
  theDiscountWarning.innerHTML = 'Product Waived!'
  theDiscountWarning.style = 'color:green'
  theProductDiscount.disabled = true
  theProductDiscountBtn.disabled = true
  theRemoveDiscountBtn.style.display = ''
  theProductDiscountBtn.style.display = 'none'
  theProductWaiveBtn.style.display = 'none'
  discountFound = true
  discountsSelected = Array(0, 'Waived')
}

if (orderDiscountBtn) {
  removeDiscountBtn.style.display = 'none'
  orderDiscount.style.display = 'none'

  orderDiscountBtn.addEventListener('click', function(){
    if (discountingOrder) {
      startOrderDiscount(orderDiscount.value)      
    } else {
      discountingOrder = true
      orderDiscount.style.display = ''
    }
  })

  removeDiscountBtn.addEventListener('click', function(){
    let discountFound = false
    discountsSelected = false
    discountWarning.innerHTML = 'Discount removed!'
    discountWarning.style = 'color:red'
    orderDiscount.disabled = false
    orderDiscount.value = ""
    orderDiscountBtn.disabled = false
    removeDiscountBtn.style.display = 'none'
    orderDiscountBtn.style.display = ''
  })
}

ipcRenderer.send('gather-products-order')

ipcRenderer.on('return-products-order-all', (event, arg) => {
  productsData = arg[0];
  discountsData = arg[1];
})

ipcRenderer.on('return-category-order-all', (event, arg) => {
  categoryData = arg[0];
  categoryData.forEach(category => {
    var accordionItem = document.createElement('div')
    accordionItem.className = 'accordion-item'
    var accordionHeader = document.createElement('h1')
    accordionHeader.className = 'accordion-header'
    accordionHeader.id = 'heading'+category[0]
    var accordionBtn = document.createElement('button')
    accordionBtn.className = 'accordion-button collapsed'
    accordionBtn.setAttribute("aria-labelledby", "heading"+category[0])
    accordionBtn.setAttribute("data-bs-parent", "#accordionExample")
    accordionBtn.setAttribute("data-bs-toggle", "collapse")
    accordionBtn.setAttribute("data-bs-target", "#collapse"+category[0])
    accordionBtn.setAttribute("aria-expanded", "false")
    accordionBtn.setAttribute("aria-controls", "collapse"+category[0])                
    accordionBtn.innerHTML = category[1].name
    accordionBtn.style.backgroundColor = category[1].color;


    var accordionCollapse = document.createElement('div')
    accordionCollapse.id = 'collapse' + category[0]                
    accordionCollapse.className = 'accordion-collapse collapse'                
    accordionCollapse.setAttribute("aria-labelledby", "heading"+category[0])                
    accordionCollapse.setAttribute("data-bs-parent", "#accordionExample")                

    var accordionBody = document.createElement('div')
    accordionBody.id = 'accordion-body'+category[0]                
    accordionBody.className = 'accordion-body'
    
    var accordionBodyTxt = document.createElement('h4')
    accordionBodyTxt.innerHTML = category[1].desc  
    
    let accordionBodyTxtDiv = document.createElement('div')
    accordionBodyTxtDiv.className = 'container'

    let accordionBodyTxtDivRow = document.createElement('div')
    accordionBodyTxtDivRow.className = "row justify-content-md-center row-cols-3"
    accordionBodyTxtDivRow.id = "row"+category[0]

    var accordionBodyTxtBr = document.createElement('br')

    document.getElementById('accordionExample').appendChild(accordionItem)
    accordionItem.appendChild(accordionHeader)
    accordionItem.appendChild(accordionCollapse)
    accordionHeader.appendChild(accordionBtn)
    accordionCollapse.appendChild(accordionBody)
    accordionBody.appendChild(accordionBodyTxt)
    accordionBody.appendChild(accordionBodyTxtBr)
    accordionBody.appendChild(accordionBodyTxtDiv)
    accordionBodyTxtDiv.appendChild(accordionBodyTxtDivRow)
  });
})

ipcRenderer.on('return-products-order', (event, arg) => {
  theProductID = arg[0]
  if (!arg[1].active){
    return
  }

  //  https://firebasestorage.googleapis.com/v0/b/club-pittsburgh-entry.appspot.com/o/product-images%2F286x180.svg?alt=media&token=c3e286ae-2e1d-4411-ba99-679bd7617df1

  //  <li class="list-group-item">An item</li>
  let productSearchItem = document.createElement('li')
  productSearchItem.className = 'list-group-item'
  productSearchItem.innerHTML = arg[1].name
  if (arg[1].rental) {
    productSearchItem.setAttribute('data-bs-toggle', 'modal')
    productSearchItem.setAttribute('data-bs-target', '#myModal3')
  }
  productSearchItem.tabIndex = 0
  productSearchItem.setAttribute('barcode', arg[1].barcode)
  productSearchItem.addEventListener('click', function(){
    addProductCard(arg)
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))
  })
  productSearchItem.onkeypress = function (event) {
    if (event.key == 'Enter') {
      productSearchItem.click()
//      addProductCard(arg)
 //     ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg))
    }
  };
  productSearchItem.style.display = 'none'


  productListSearch.appendChild(productSearchItem)

  let theAccordionBody = document.getElementById('accordion-body'+arg[1].cat)
  let theAccordionBodyRow = document.getElementById("row" + arg[1].cat) 

  let theAccordionBodyRowCol = document.createElement('div')
  theAccordionBodyRowCol.className = 'col-md-auto'

  let theAccordionBodyRowColBr = document.createElement('br')

  var productCard = document.createElement('div')
  productCard.className = 'card'
  productCard.style = 'width: 18rem;'

  var productImg = document.createElement('img')
  productImg.className = 'card-img-top'
  productImg.id = 'productImg' + arg[0]
  if (arg[1].image) {
    productImg.setAttribute('src', arg[1].image)
  }else{
    productImg.setAttribute('src', './286x180.svg')    
  }
  if (arg[1].rental) {
    productImg.setAttribute('data-bs-toggle', 'modal')
    productImg.setAttribute('data-bs-target', '#myModal3')
  }
  productImg.addEventListener('click', function(){
    addProductCard(arg)
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))
  })
  
  var productBody = document.createElement('div')
  productBody.className = 'card-body'
  productBody.addEventListener('click', function () {
    addProductCard(arg)
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))
  })

  var productTitle = document.createElement('h5')
  productTitle.className = 'card-title'
  productTitle.innerHTML = arg[1].name + ' - ' + formatter.format(arg[1].price)

  var productBodyTxt = document.createElement('p')
  productBodyTxt.className = 'card-text'
  productBodyTxt.innerHTML = arg[1].desc

  /*
  var productFooter = document.createElement('a')
  productFooter.innerHTML = 'Add to order'
  productFooter.className = 'btn btn-success'
  productFooter.id = 'atoBtn'+arg[0]
  if (arg[1].rental) {
    productFooter.setAttribute('data-bs-toggle', 'modal')
    productFooter.setAttribute('data-bs-target', '#myModal3')
  }
  productFooter.addEventListener('click', function(){
    addProductCard(arg)
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg))
  })
  */

  var productBreak = document.createElement('br')

  theAccordionBodyRow.appendChild(theAccordionBodyRowCol) 
  theAccordionBodyRowCol.appendChild(productCard)
  if (arg[1].favorite) {
    document.getElementById('favoriteProductCardRow').appendChild(productCard)  
  }
  theAccordionBodyRowCol.appendChild(theAccordionBodyRowColBr)
  productCard.appendChild(productImg)
  productCard.appendChild(productBody)
  productBody.appendChild(productTitle)
  productBody.appendChild(productBodyTxt)
//  productBody.appendChild(productFooter)
  theAccordionBody.appendChild(productBreak)
})

ipcRenderer.on('send-customer-info', (event, arg) => {
  theCustomerInfo = arg
  modal3Body2.style.display = 'none'  
  theCustomerID = -1
  if (!arg[0]) {
    customerName.innerHTML = "Quick Sale"
    checkoutCustomerInfo.innerHTML = "Quick Sale"
    theCustomerEMail = ""
    theCustomerID = -1
    return
  }
  customerName.innerHTML = arg[0]
  checkoutCustomerInfo.innerHTML = arg[0]
  if (arg[1]) {
    theCustomerEMail = arg[1].email    
  } else {
    theCustomerEMail = ""
  }

  if (arg[2]) {
    modal3Body.style.display = 'none'  
    modal3Body2.style.display = ''  
    theCustomerID = arg[2]
  }else{
    modal3Body.style.display = 'none'
    modal3Body2.style.display = ''  
    theCustomerID = 0
  }
})

ipcRenderer.on('send-product-info', (event, arg) => {
  addProductCard(arg)
})

ipcRenderer.on('order-suspended', (event, arg) => {
  resumeBtn.style.display = ''
  suspendBtn.style.display = 'none'
})