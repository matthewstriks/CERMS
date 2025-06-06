const { isArray } = require("jquery");

let productSection = document.getElementById('productSection');
let cardHeader = document.getElementById('cardHeader');
let customerName = document.getElementById('customerName');
let checkoutCustomerInfo = document.getElementById('checkoutCustomerInfo');
let clearBtn = document.getElementById('clearBtn');
let resumeBtn = document.getElementById('resumeBtn');
let suspendBtn = document.getElementById('suspendBtn');
let startReturnBtn = document.getElementById('startReturnBtn');
let endReturnBtn = document.getElementById('endReturnBtn');
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
let completeTagCheck = document.getElementById('completeTagCheck');
let completeTagNotes = document.getElementById('completeTagNotes');

let accordionFavoriteheadingZero = document.getElementById('accordionFavoriteheadingZero');
let favoriteProductCardRow = document.getElementById('favoriteProductCardRow');

let theAddingRental;

let totalLeftAmt;
let ran = false
let discountingOrder = false
let theCustomerInfo = Array();
let favPros = Array()
let isReturn = false
let theProductCheckoutList = ""
let proPrice = false
let proPriceArray = false
let productsAFP = Array()
let restrictPros = false
let theTaxRate
let tryingToAddDNA = false
let preventDNA = false

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
    theProductCheckoutList = productCheckoutList.innerHTML
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
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), Number(theChange)), theDiscountInfoArray, recieptStyle, "", addLockerRoomInput.value, addLockerRoomInput2.value, theProductCheckoutList))
  })  
}

if (printBtn) {
  printBtn.addEventListener('click', function(){
    recieptStyle = 1
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), Number(theChange)), theDiscountInfoArray, recieptStyle, "", addLockerRoomInput.value, addLockerRoomInput2.value, theProductCheckoutList))
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
    ipcRenderer.send('order-checkout', Array(theCustomerID, productsTotal, discountsSelected, Array(productsSub, productsTax, productsTot, productsOGTot), Array(Number(cdCardEnter.value), Number(gCardEnter.value), Number(cashEnter.value), theChange), theDiscountInfoArray, recieptStyle, membersEmailInput.value, addLockerRoomInput.value, addLockerRoomInput2.value, theProductCheckoutList))  
  })
}

if (completeCheckIn) {
  completeCheckIn.addEventListener('click', function(){
    addProductCard(theAddingRental, addLockerRoomInput.value)
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

if (startReturnBtn) {
  startReturnBtn.style.display = ''
  endReturnBtn.style.display = 'none'
  startReturnBtn.addEventListener('click', function(){
    cardHeader.innerHTML = 'Order Card - <h3><b style="color: red">Return Mode Active</b></h3>'
    isReturn = true
    startReturnBtn.style.display = 'none'
    endReturnBtn.style.display = ''
  })
}

if (endReturnBtn) {
  endReturnBtn.addEventListener('click', function(){
    cardHeader.innerHTML = 'Order Card'
    isReturn = false
    startReturnBtn.style.display = ''
    endReturnBtn.style.display = 'none'
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
      let currentProductCard = document.getElementById(item[0] + 'newCard')
      let currQuantity = 1
      let discountInfo = currentProductCard.getAttribute('discount')
      let discountInfoWaive = (currentProductCard.getAttribute('waived'))
      let theDiscountInfo;
      discountsData.forEach((discountItem, di) => {
        if (discountItem[0] == discountInfo){
          theDiscountInfo = discountItem
          theDiscountInfoArray.push(Array(item[0], discountInfo))
        } 
      })
      for (var i2 = 0; i2 < currQuantity; i2++) {
        productsData.forEach((item2, i3) => {
          if (item2[0] == item[0]) {
            let newP = document.createElement('p')
            let theProductPrice = item2[1].price

            if (item2[1].askforprice) {
              productsAFP.forEach(afp => {
                if (afp[0] == item2[0]) {
                  theProductPrice = afp[1]              
                  delete afp
                }
              });
            }

            if (item2[1].payout) {
              theProductPrice = -theProductPrice
            }

            if (theDiscountInfo && !discountApplied) {
              if (theDiscountInfo[1].dollar) {
                theProductPrice = theProductPrice - theDiscountInfo[1].amount
                newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + formatter.format(theDiscountInfo[1].amount) + ' OFF ' + formatter.format(item2[1].price) + ')'                
                if (item[1]) {
                  newP.innerHTML = item2[1].name + ' (' + item[1] + ') - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + formatter.format(theDiscountInfo[1].amount) + ' OFF ' + formatter.format(item2[1].price) + ')'                                  
                }
                discountApplied = true
              } else if (theDiscountInfo[0] == 'return'){
                theProductPrice = -Math.abs(theProductPrice) 
                newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (Return)'
                if (item[1]) {
                  newP.innerHTML = item2[1].name + ' (' + item[1] + ') - ' + formatter.format(theProductPrice) + ' (Return)'                  
                }
                discountApplied = true
              } else {
                let thePer = (theDiscountInfo[1].amount / 100)
                let theOff = theProductPrice * thePer
                theProductPrice = theProductPrice - theOff
                newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + theDiscountInfo[1].amount + '% OFF ' + formatter.format(item2[1].price) + ')'                
                if (item[1]) {
                  newP.innerHTML = item2[1].name + ' (' + item[1] + ') - ' + formatter.format(theProductPrice) + ' (Discount ' + theDiscountInfo[1].code + ': ' + theDiscountInfo[1].amount + '% OFF ' + formatter.format(item2[1].price) + ')'                                  
                }
                discountApplied = true
              }    
            } else{
              newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice)
              if (item[1]) {
                newP.innerHTML = item2[1].name + ' (' + item[1] + ') - ' + formatter.format(theProductPrice)                
              }
            } 
            if (discountInfoWaive == "1") {
              theProductPrice = 0
              newP.innerHTML = item2[1].name + ' - ' + formatter.format(theProductPrice) + ' (WAIVED)'
              if (item[1]) {
                newP.innerHTML = item2[1].name + ' (' + item[1] + ') - ' + formatter.format(theProductPrice) + ' (WAIVED)'                
              }
              discountApplied = true
            }    
            productCheckoutList.appendChild(newP)
            productsSub = productsSub + Number(theProductPrice)
            productsOGTot = productsOGTot + Number(theProductPrice)
          
            if (item2[1].taxable) {
//              productsTax = productsTax + (Number(theProductPrice) * .07)              
              productsTax = productsTax + (Number(theProductPrice) * theTaxRate)              
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

    /*
    if (productsTot < 0) {
      productsTot = 0
    }    
    */
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

document.getElementById('myModal5Close').addEventListener('click', function () {
  // Get the backdrop so we can remove it from the body
  const backdrop = document.querySelector(".modal-backdrop.fade.show");
  const modal = document.getElementById('myModal5')
  // Remove the `modal-open` class from the body
  document.body.classList.remove("modal-open");
  // Re-hide the modal from screen readers
  modal.setAttribute("aria-hidden", "true");
  // Remove the `show` class from the backdrop
  backdrop.classList.remove("show");
  // Remove the `show` class from the modal
  modal.classList.remove("show");
  // Change the modal `display` style to `none`
  modal.style.display = "none";
  // Remove the backdrop div from the body
  backdrop.remove();
})

document.getElementById('submitProPrice').addEventListener("click", function(){

  proPrice = document.getElementById('proPrice').value
  productsAFP.push(Array(proPriceArray[0][0], proPrice))

  addProductCard(proPriceArray[0], proPriceArray[1])  
  // Get the backdrop so we can remove it from the body
  const backdrop = document.querySelector(".modal-backdrop.fade.show");
  const modal = document.getElementById('myModal5')
  // Remove the `modal-open` class from the body
  document.body.classList.remove("modal-open");
  // Re-hide the modal from screen readers
  modal.setAttribute("aria-hidden", "true");
  // Remove the `show` class from the backdrop
  backdrop.classList.remove("show");
  // Remove the `show` class from the modal
  modal.classList.remove("show");
  // Change the modal `display` style to `none`
  modal.style.display = "none";
  // Remove the backdrop div from the body
  backdrop.remove();
  restrictPros = true
})

function addProductCard(theProduct, theProductInfo){  
  if (restrictPros) {
    notificationSystem('warning', 'You can only process one payout at a time. (no additional products allowed)', 5000, 99)
    return
  }
  if (!Array.isArray(theProduct)) {
    productsData.forEach(pro => {
      if (theProduct == pro[0]) {
        theProduct = pro
      }
    });
  }

  if (theCustomerInfo && theCustomerInfo[1]?.dna) {
    if (theProduct[1].rental && preventDNA) {
      notificationSystem(
        'danger',
        'This user is on the DNA list. You cannot add any rental products to this order.',
        5000,
        99
      );
      return;
    } else if (theProduct[1].rental && !tryingToAddDNA) {
      tryingToAddDNA = true;
      setTimeout(() => {
        tryingToAddDNA = false;
      }, 5000);
      notificationSystem(
        'danger',
        'This user is on the DNA list. If you still want to add this product you can override this by adding the rental again within 5 seconds.',
        5000,
        99
      );
      return;
    }
  }

  let productPrice = theProduct[1].price

  if (theProduct[1].askforprice && !proPrice) {
    // Create the backdrop div element
    const backdrop = document.createElement("div");
    const modal = document.getElementById('myModal5')
    // Add the required classes to it.
    backdrop.classList.add("modal-backdrop", "fade", "show");
    // Add the `modal-open` class to the body
    document.body.classList.add("modal-open");
    // Append the backdrop div to the body
    document.body.appendChild(backdrop);
    // Set the `display` style of the modal to `block`
    modal.style.display = "block";
    // This is for accessibility tools.  We want to make it no longer hidden to screen readers.
    modal.setAttribute("aria-hidden", "false", "show");
    // Add the show class to the modal
    modal.classList.add("show");

    document.getElementById('proPrice').focus()

    proPriceArray = Array(theProduct, theProductInfo)    

    return
  } else if (theProduct[1].askforprice) {
    productPrice = proPrice
    proPrice = false
    proPriceArray = false
  }

  checkoutBtn.disabled = false
  if (isReturn) {
    productPrice = -Math.abs(productPrice)
  }
  let currentProductCard = document.getElementById(theProduct[0] + 'newCard')
  let currentProductCardInfo = document.getElementById(theProduct[0] + 'cardHeader')
  if (currentProductCard) {
    let currQuantity = currentProductCard.getAttribute('quantity');
    currQuantity = Number(currQuantity) + 1
    currentProductCard.setAttribute('quantity', currQuantity)
    currentProductCardInfo.innerHTML = theProduct[1].name + " - " + formatter.format(productPrice) + ' - x' + currQuantity + ' <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'        
    if (theProductInfo) {
      if (!currentProductCard.getAttribute('itemNum')) {
        currentProductCard.setAttribute('itemNum', theProductInfo)        
      } else {
        currentProductCard.setAttribute('itemNum', currentProductCard.getAttribute('itemNum') + ', ' + theProductInfo)
      }
      currentProductCardInfo.innerHTML = theProduct[1].name + " (" + currentProductCard.getAttribute('itemNum') + ") - " + formatter.format(productPrice) + ' - x' + currQuantity + ' <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'          
    }

    let plusBtn = document.getElementById(theProduct[0] + 'plus')
    if (plusBtn) {
      plusBtn.addEventListener('click', function () {
        ipcRenderer.send('add-to-order', Array(theCustomerInfo, theProduct, addLockerRoomInput.value, addLockerRoomInput2.value))
        addProductCard(theProduct)
      })
    }

    productsSelected.push(Array(theProduct[0], theProductInfo))

    productsTotal.push(theProduct[0])
    return
  }
  productsSelected.push(Array(theProduct[0], theProductInfo))
  productsTotal.push(theProduct[0])
  let newCard = document.createElement('div')
  newCard.setAttribute("quantity", 1)
  newCard.setAttribute('waived', 0)
  newCard.className = 'card'
  newCard.id = theProduct[0] + 'newCard'

  currentProductCard = newCard

  let cardHeader = document.createElement('div')
  cardHeader.className = 'card-header'
  cardHeader.innerHTML = theProduct[1].name + " - " + formatter.format(productPrice) + ' - x1 <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'    
  if (theProductInfo) {
    newCard.setAttribute('itemNum', theProductInfo)
    cardHeader.innerHTML = theProduct[1].name + " (" + theProductInfo + ") - " + formatter.format(productPrice) + ' - x1 <a id="' + theProduct[0] + 'plus" href="#" class="btn btn-success"><i class="fa-solid fa-plus"></i></a>'        
  }
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
      ipcRenderer.send('remove-from-order', Array(theProduct, theProductInfo))
      if (theProduct[1].payout) {
        productsAFP.forEach(afp => {
          if (afp[0] == theProduct[0]) {
            delete afp
          }
        });
        restrictPros = false          
      }
    })
  }

  if (plusBtn) {
    plusBtn.addEventListener('click', function(){
      ipcRenderer.send('add-to-order', Array(theCustomerInfo, theProduct, addLockerRoomInput.value, addLockerRoomInput2.value))
      addProductCard(theProduct)
    })
  }

  if (isReturn) {
    startProductDiscount("return", productDiscountWarning, productDiscount, productDiscountBtn, productWaiveBtn, removeProductDiscountBtn, currentProductCard)
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
      if (theProduct[0] == item[0]) {
        productsTotal.splice(i, 1)
        return
      }
    });
    if (currQuantity <= 0) {
      currentProductCard.remove()
      productsSelected.forEach((item, i) => {
        if (theProduct[0] == item[0]) {
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
      let expDate = new Date(item[1].expires.seconds * 1000)
      let todayDate = new Date(Math.floor(Date.now()))      
      if (expDate <= todayDate) {
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
      let expDate = new Date(item[1].expires.seconds * 1000)
      let todayDate = new Date(Math.floor(Date.now()))      
      if (expDate <= todayDate) {
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
    } else if ((item[0] == 'return') && (discountCode == 'return')) {
      theProductCard.setAttribute('discount', item[0])
      theDiscountWarning.innerHTML = 'Return applied!'
      theDiscountWarning.style = 'color:green'
      theProductDiscount.disabled = true
      theProductDiscountBtn.disabled = true
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
ipcRenderer.send('gather-taxRate')
ipcRenderer.send('gather-preventDNA')

ipcRenderer.on('receive-taxRate', (event, arg) => {
  if (arg) {  
    theTaxRate = arg     
  } else {
    theTaxRate = .07
  }
})

ipcRenderer.on('receive-preventDNA', (event, arg) => {
  preventDNA = arg
})

ipcRenderer.on('return-products-order-all', (event, arg) => {
  console.log(arg)
  productsData = arg[0];
  discountsData = arg[1];
  discountsData.push(Array("return", Array()))
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
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))
    addProductCard(arg)
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
    if (!arg[1].rental) {
      addProductCard(arg)
    } else {
      theAddingRental = arg
    }
    setTimeout(() => {
      ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))      
    }, 5000);
  })
  
  var productBody = document.createElement('div')
  productBody.className = 'card-body'
  productBody.addEventListener('click', function () {
    ipcRenderer.send('add-to-order', Array(theCustomerInfo, arg, addLockerRoomInput.value, addLockerRoomInput2.value))
    addProductCard(arg)
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
  if (arg[1].favorite && !favPros.includes(arg[0])) {
    favPros.push(arg[0])
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
  if (theCustomerInfo && theCustomerInfo[1]?.tag) {
    if (theCustomerInfo[1].tag) {
      customerName.innerHTML = customerName.innerHTML + " <button class='btn btn-success' id='readNotesBtn' data-bs-toggle='modal' data-bs-target='#myModal4'>Read Notes</button>"
      document.getElementById('readNotesBtn').click()
      completeTagNotes.value = theCustomerInfo[1].notes
    }
  }
})

ipcRenderer.on('send-product-info', (event, arg) => {
  addProductCard(arg[0], arg[1])
})

ipcRenderer.on('order-suspended', (event, arg) => {
  resumeBtn.style.display = ''
  suspendBtn.style.display = 'none'
})

if (document.getElementById('openRegisterDiv')) {
  document.getElementById('openRegisterDiv').style.display = 'none'
  ipcRenderer.send('register-status-request')
}

ipcRenderer.on('no-register-active', (event, arg) => {
  document.getElementById('openRegisterDiv').style.display = ''
  document.getElementById('orderPageDiv').style.display = 'none'
  document.getElementById('orderPageDiv2').style.display = 'none'
})

ipcRenderer.on('register-started', (event, arg) => {
  document.getElementById('openRegisterDiv').style.display = 'none'
  document.getElementById('orderPageDiv').style.display = ''
  document.getElementById('orderPageDiv2').style.display = ''
})

document.getElementById("startingSubmitBtn").addEventListener('click', function () {
  ipcRenderer.send('starting-register-no-redirect', Array(document.getElementById("startingAmt").value, document.getElementById("startingShift").value))
})

ipcRenderer.on('register-shift-times-return', (event, arg) => {
  document.getElementById('shiftA').innerHTML = arg[0]
  document.getElementById('shiftB').innerHTML = arg[1]
  document.getElementById('shiftC').innerHTML = arg[2]
})