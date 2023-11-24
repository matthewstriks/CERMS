const { ipcRenderer } = require('electron')
var Tablesort = require('tablesort');
let logoutBtn = document.getElementById('logoutBtn');

let categoryTable = document.getElementById('categoryTable')
let productSearch = document.getElementById('productSearch')
let productTable = document.getElementById('productTable')
let discountsTable = document.getElementById('discountsTable')

let categoryName = document.getElementById('categoryName')
let categoryDescription = document.getElementById('categoryDescription')
let categoryColor = document.getElementById('categoryColor')
let completeCategory = document.getElementById('completeCategory')
let editCategoryName = document.getElementById('editCategoryName')
let editCategoryDescription = document.getElementById('editCategoryDescription')
let editCategoryColor = document.getElementById('editCategoryColor')
let editCompleteCategory = document.getElementById('editCompleteCategory')

let productCategory = document.getElementById('productCategory')
let productName = document.getElementById('productName')
let productBarcode = document.getElementById('productBarcode')
let productPrice = document.getElementById('productPrice')
let productInvWarning = document.getElementById('productInvWarning')
let productFavorite = document.getElementById('productFavorite')
let productTaxable = document.getElementById('productTaxable')
let productActive = document.getElementById('productActive')
let productCore = document.getElementById('productCore')
let productRental = document.getElementById('productRental')
let productRentalDiv = document.getElementById('productRentalDiv')
let productRentalLength = document.getElementById('productRentalLength')
let productRentalLengthType = document.getElementById('productRentalLengthType')
let productMembership = document.getElementById('productMembership')
let productMembershipDiv = document.getElementById('productMembershipDiv')
let productMembershipLength = document.getElementById('productMembershipLength')
let productMembershipLengthType = document.getElementById('productMembershipLengthType')
let productDesc = document.getElementById('productDesc')
let productInventory = document.getElementById('productInventory')
let productInventoryPar = document.getElementById('productInventoryPar')
let completeProduct = document.getElementById('completeProduct')
let addProductForm = document.getElementById('addProductForm')
let uploadProductImg = document.getElementById('uploadProductImg')

let editProductCategory = document.getElementById('editProductCategory')
let editProductName = document.getElementById('editProductName')
let editProductBarcode = document.getElementById('editProductBarcode')
let editProductPrice = document.getElementById('editProductPrice')
let editProductInvWarning = document.getElementById('editProductInvWarning')
let editProductFavorite = document.getElementById('editProductFavorite')
let editProductTaxable = document.getElementById('editProductTaxable')
let editProductActive = document.getElementById('editProductActive')
let editProductCore = document.getElementById('editProductCore')
let editProductRental = document.getElementById('editProductRental')
let editProductRentalDiv = document.getElementById('editProductRentalDiv')
let editProductRentalLength = document.getElementById('editProductRentalLength')
let editProductRentalLengthType = document.getElementById('editProductRentalLengthType')
let editProductMembership = document.getElementById('editProductMembership')
let editProductMembershipDiv = document.getElementById('editProductMembershipDiv')
let editProductMembershipLength = document.getElementById('editProductMembershipLength')
let editProductMembershipLengthType = document.getElementById('editProductMembershipLengthType')
let editProductDesc = document.getElementById('editProductDesc')
let editProductInventory = document.getElementById('editProductInventory')
let editProductInventoryPar = document.getElementById('editProductInventoryPar')
let productImg = document.getElementById('productImg')
let editProductImg = document.getElementById('editProductImg')
let editProductImgRemove = document.getElementById('editProductImgRemove')
let editCompleteProduct = document.getElementById('editCompleteProduct')
let editProductForm = document.getElementById('editProductForm')

let discountCode = document.getElementById('discountCode')
let discountTypeP = document.getElementById('discountTypeP')
let discountTypeO = document.getElementById('discountTypeO')
let asCheck = document.getElementById('asCheck')
let asProSec = document.getElementById('asProSec')
let asPro = document.getElementById('asPro')
let discountDollar = document.getElementById('discountDollar')
let discountPercent = document.getElementById('discountPercent')
let discountAmount = document.getElementById('discountAmount')
let discountUses = document.getElementById('discountUses')
let discountUsed = document.getElementById('discountUsed')
let discountExpDate = document.getElementById('discountExpDate')
let editDiscountCode = document.getElementById('editDiscountCode')
let editDiscountTypeP = document.getElementById('editDiscountTypeP')
let editDiscountTypeO = document.getElementById('editDiscountTypeO')
let editAsCheck = document.getElementById('editAsCheck')
let editAsProSec = document.getElementById('editAsProSec')
let editAsPro = document.getElementById('editAsPro')
let editDiscountDollar = document.getElementById('editDiscountDollar')
let editDiscountPercent = document.getElementById('editDiscountPercent')
let editDiscountAmount = document.getElementById('editDiscountAmount')
let editDiscountUses = document.getElementById('editDiscountUses')
let editDiscountUsed = document.getElementById('editDiscountUsed')
let editDiscountExpDate = document.getElementById('editDiscountExpDate')

let categoryEditing;
let productEditing;
let discountEditing;

let productsData = Array()

let enterPressed

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

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

if (productMembershipDiv) {
  productMembershipDiv.style.display = 'none'  
}

if (productRentalDiv) {
  productRentalDiv.style.display = 'none'  
}

if (editProductRentalDiv) {
  editProductRentalDiv.style.display = 'none'  
}

if (editProductMembershipDiv) {
  editProductMembershipDiv.style.display = 'none'  
}

if (productMembership) {
  productMembership.addEventListener('change', function(){
    if (productMembership.checked) {
      productMembershipDiv.style.display = ''            
    }else{
      productMembershipDiv.style.display = 'none'            
    }
  })
}

if (productRental) {
  productRental.addEventListener('change', function(){
    if (productRental.checked) {
      productRentalDiv.style.display = ''            
    }else{
      productRentalDiv.style.display = 'none'            
    }
  })
}

if (editProductRental) {
  editProductRental.addEventListener('change', function(){
    if (editProductRental.checked) {
      editProductRentalDiv.style.display = ''            
    }else{
      editProductRentalDiv.style.display = 'none'            
    }
  })
}

if (editProductMembership) {
  editProductMembership.addEventListener('change', function(){
    if (editProductMembership.checked) {
      editProductMembershipDiv.style.display = ''            
    }else{
      editProductMembershipDiv.style.display = 'none'            
    }
  })
}

if (productSearch) {
  productSearch.focus();
  productSearch.addEventListener("keydown", function (e) {
    if (e.code === "Enter") {
      enterPressed = true;
      if (productSearch.value == '') {
        enterPressed = false;
      }
    }
  });
}

if (asCheck) {
  asProSec.style.display = "none";
  asCheck.addEventListener('click', function(){
    if (asCheck.checked) {
      asProSec.style.display = "";      
    }else{
      asProSec.style.display = "none";
    }
  })
}

if (editAsCheck) {
  editAsProSec.style.display = "none";
  editAsCheck.addEventListener('click', function(){
    if (editAsCheck.checked) {
      editAsProSec.style.display = "";      
    }else{
      editAsProSec.style.display = "none";
    }
  })
}

function productSearchFunct(){
  var filter, tr, td, i, txtValue;
  filter = productSearch.value.toUpperCase();
  tr = productTable.getElementsByTagName("tr");
  for (i = 0; i < tr.length; i++) {
    td = tr[i].getElementsByTagName("td")[0];
    td2 = tr[i].getElementsByTagName("td")[3];
    if (td) {
      let txtValue = td.textContent || td.innerText;
      let txtValue2 = td2.textContent || td2.innerText;
      let txtValue3 = tr[i].getAttribute('categoryName');
      if (!txtValue3){
        txtValue3 = ""
      }
      if (!enterPressed) {
        if (txtValue.toUpperCase().indexOf(filter) > -1 || txtValue2.toUpperCase().indexOf(filter) > -1 || txtValue3.toUpperCase().indexOf(filter) > -1) {
          tr[i].style.display = "";
        } else {
          tr[i].style.display = "none";
        }
      } else {
        if (txtValue == "") {
          enterPressed = false;
        }
      }
    }
  }
}

function addCategory(){
  ipcRenderer.send('create-category', Array(categoryName.value, categoryDescription.value, categoryColor.value))
}

function editCategory(){
  ipcRenderer.send('edit-category', Array(categoryEditing, editCategoryName.value, editCategoryDescription.value, editCategoryColor.value))
}

function removeCategory(){
  ipcRenderer.send('remove-category', categoryEditing)
}

function addProduct(){
  ipcRenderer.send('create-product', Array(productCategory.value, productName.value, productPrice.value, productInvWarning.value, productDesc.value, productInventory.value, productFavorite.checked, productTaxable.checked, productActive.checked, productCore.checked, productRental.checked, productMembership.checked, productMembershipLength.value, productMembershipLengthType.value, productInventoryPar.value, productBarcode.value, productRentalLength.value, productRentalLengthType.value))
}

function editProduct(){
  ipcRenderer.send('edit-product', Array(productEditing, editProductCategory.value, editProductName.value, editProductPrice.value, editProductInvWarning.value, editProductDesc.value, editProductInventory.value, editProductFavorite.checked, editProductTaxable.checked, editProductActive.checked, editProductCore.checked, editProductRental.checked, editProductMembership.checked, editProductMembershipLength.value, editProductMembershipLengthType.value, editProductInventoryPar.value, editProductBarcode.value, editProductRentalLength.value, editProductRentalLengthType.value))
}

function removeProduct(){
  ipcRenderer.send('remove-product', productEditing)
}

function addDiscount(){
  ipcRenderer.send('create-discount', Array(discountCode.value, discountDollar.checked, discountPercent.checked, discountAmount.value, asCheck.checked, asPro.value, discountExpDate.value, discountTypeP.checked, discountTypeO.checked, discountUses.value, discountUsed.value))
}

function editDiscount(){
  ipcRenderer.send('edit-discount', Array(discountEditing, editDiscountCode.value, editDiscountDollar.checked, editDiscountPercent.checked, editDiscountAmount.value, editAsCheck.checked, editAsPro.value, editDiscountExpDate.value, editDiscountTypeP.checked, editDiscountTypeO.checked, editDiscountUses.value, editDiscountUsed.value))
}

function removeDiscount(){
  ipcRenderer.send('remove-discount', discountEditing)
}

if (uploadProductImg) {
  uploadProductImg.addEventListener('click', function(){
    ipcRenderer.send('uploadProductImg')
  })
}

function timeConverter(UNIX_timestamp){
  var a = new Date(UNIX_timestamp * 1000);
  var year = a.getFullYear();
  var month = a.getMonth() + 1;
  var date = a.getDate();

  if (month <= 9) {
    month = '0' + month
  }
  if (date <= 9) {
    date = '0' + date
  }

  var time = month + '/' + date + '/' + year ;
  return time;
}

function timeConverter2(UNIX_timestamp){
  var a = new Date(UNIX_timestamp * 1000);
  var year = a.getFullYear();
  var month = a.getMonth() + 1;
  var date = a.getDate();

  if (month <= 9) {
    month = '0' + month
  }
  if (date <= 9) {
    date = '0' + date
  }

  var time = year + '-' + month + '-' + date ;
  return time;
}

if (categoryTable) {
  ipcRenderer.send('check-products-perms')
  ipcRenderer.send('gather-categories')
  new Tablesort(categoryTable);
}

if (productTable) {
  ipcRenderer.send('gather-products')
  new Tablesort(productTable);  
  setTimeout(() => {
    productsData.forEach(product => {
      product[1].forEach(arg => {
        if (asPro) {
          var opt = document.createElement('option');
          opt.value = arg[0];
          opt.innerHTML = arg[1].name;
          var opt2 = document.createElement('option');
          opt2.value = arg[0];
          opt2.innerHTML = arg[1].name;
          asPro.appendChild(opt);
          editAsPro.appendChild(opt2);
        }

        var row = productTable.insertRow(1);
        row.id = 'row' + arg[0];
        row.setAttribute('categoryName', arg[2].name);
        if (arg[2] && arg[1].active != false) {
          row.style.backgroundColor = arg[2].color
        } else if (!arg[1].active) {
          row.style.backgroundColor = 'Crimson'
        }

        var cell1 = row.insertCell(0);
        cell1.id = 'namecell' + arg[0];
        var cell2 = row.insertCell(1);
        cell2.id = 'pricecell' + arg[0];
        var cell3 = row.insertCell(2);
        cell3.id = 'invwarncell' + arg[0];
        var cell4 = row.insertCell(3);
        cell4.id = 'desccell' + arg[0];
        var cell5 = row.insertCell(4);
        cell5.id = 'invcell' + arg[0];
        var cell6 = row.insertCell(5);
        cell6.id = 'buttoncell' + arg[0];

        cell1.innerHTML = arg[1].name;
        cell2.innerHTML = arg[1].price;
        if (arg[1].invWarning) {
          cell3.innerHTML = arg[1].invWarning;
        } else {
          cell3.innerHTML = 'N/A';
        }
        cell4.innerHTML = arg[1].desc;

        if (arg[1].inventory === 0) {
          cell5.innerHTML = arg[1].inventory + '/' + arg[1].inventoryPar;
        } else if (!arg[1].inventory) {
          cell5.innerHTML = 'unlimited';
        } else {
          cell5.innerHTML = arg[1].inventory + '/' + arg[1].inventoryPar;
        }

        cell6.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal5' id='edit" + arg[0] + "' type='button' class='btn btn-warning'>Edit Product</button> <button id='remove" + arg[0] + "' data-bs-toggle='modal' data-bs-target='#myModal6' type='button' class='btn btn-danger'>Remove Product</button>";

        document.getElementById("edit" + arg[0]).addEventListener('click', function () {
          productEditing = arg[0];
          editProductCategory.value = arg[1].cat
          editProductName.value = arg[1].name
          editProductBarcode.value = arg[1].barcode
          editProductPrice.value = arg[1].price
          editProductInvWarning.value = arg[1].invWarning
          editProductFavorite.checked = arg[1].favorite
          editProductTaxable.checked = arg[1].taxable
          editProductActive.checked = arg[1].active
          editProductCore.checked = arg[1].core
          editProductRental.checked = arg[1].rental
          editProductMembership.checked = arg[1].membership
          editProductMembershipLength.value = arg[1].membershipLengthRaw
          editProductMembershipLengthType.value = arg[1].membershipLengthType
          editProductRentalLength.value = arg[1].rentalLengthRaw
          editProductRentalLengthType.value = arg[1].rentalLengthType
          editProductDesc.value = arg[1].desc
          editProductInventory.value = arg[1].inventory
          editProductInventoryPar.value = arg[1].inventoryPar

          if (arg[1].membership) {
            editProductMembershipDiv.style.display = ''
          } else {
            editProductMembershipDiv.style.display = 'none'
          }

          if (arg[1].rental) {
            editProductRentalDiv.style.display = ''
          } else {
            editProductRentalDiv.style.display = 'none'
          }

          if (arg[1].image) {
            productImg.setAttribute('src', arg[1].image)
          }
        })

        document.getElementById("remove" + arg[0]).addEventListener('click', function () {
          productEditing = arg[0];
        })
      });
    });
  }, 3000);
}

if (discountsTable) {
  ipcRenderer.send('gather-discounts')
  new Tablesort(discountsTable);
}

if (editProductImg) {
  editProductImg.addEventListener('click', function(){
    ipcRenderer.send('edit-product-img', productEditing)
  })
}

if (editProductImgRemove) {
  editProductImgRemove.addEventListener('click', function(){
    ipcRenderer.send('edit-product-img-remove', productEditing)
  })
}

ipcRenderer.on('return-categories', (event, arg) => {
  if (!arg) {
    return
  }
  productsData.push(Array(arg[0], Array()))
  var row = categoryTable.insertRow(1);
  row.id = 'row'+arg[0];
  row.style.backgroundColor = arg[1].color

  var cell1 = row.insertCell(0);
  cell1.id = 'namecell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'descriptioncell'+arg[0];
  var cell3 = row.insertCell(2);
  cell3.id = 'actioncell'+arg[0];

  cell1.innerHTML = arg[1].name;
  cell2.innerHTML = arg[1].desc;

  cell3.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal2' id='edit"+arg[0]+"' type='button' class='btn btn-warning'>Edit Category</button> <button id='remove" +arg[0] + "' data-bs-toggle='modal' data-bs-target='#myModal3' type='button' class='btn btn-danger'>Remove Category</button>";

  document.getElementById("edit"+arg[0]).addEventListener('click', function(){
    categoryEditing = arg[0];
    editCategoryName.value = arg[1].name
    editCategoryDescription.value = arg[1].desc
    editCategoryColor.value = arg[1].color
  })

  document.getElementById("remove"+arg[0]).addEventListener('click', function(){
    categoryEditing = arg[0];
  })

  var opt = document.createElement('option');
  opt.value = arg[0];
  opt.innerHTML = arg[1].name;
  var opt2 = document.createElement('option');
  opt2.value = arg[0];
  opt2.innerHTML = arg[1].name;
  productCategory.appendChild(opt);
  editProductCategory.appendChild(opt2);
})

ipcRenderer.on('return-categories-update', (event, arg) => {
  if (!arg) {
    return
  }
  document.getElementById('namecell'+arg[0]).innerHTML = arg[1].name;
  document.getElementById('descriptioncell'+arg[0]).innerHTML = arg[1].desc;
  document.getElementById('row'+arg[0]).style.backgroundColor = arg[1].color

  document.getElementById("edit"+arg[0]).addEventListener('click', function(){
    categoryEditing = arg[0];
    editCategoryName.value = arg[1].name
    editCategoryDescription.value = arg[1].desc
    editCategoryColor.value = arg[1].color
  })

  for (var i=0; i<productCategory.length; i++) {
    if (productCategory.options[i].value == arg[0]) {
      productCategory.innerHTML(arg[1].name);
    }
  }

  for (var i=0; i<productCategory.length; i++) {
    if (editProductCategory.options[i].value == arg[0]) {
      editProductCategory.innerHTML(arg[1].name);
    }
  }
})

ipcRenderer.on('return-categories-remove', (event, arg) => {
  if (!arg) {
    return
  }
  document.getElementById('row'+arg[0]).remove();

  for (var i=0; i<productCategory.length; i++) {
    if (productCategory.options[i].value == arg[0]) {
      productCategory.remove(i);
    }
  }

  for (var i=0; i<editProductCategory.length; i++) {
    if (editProductCategory.options[i].value == arg[0]) {
      editProductCategory.remove(i);
    }
  }
})

ipcRenderer.on('return-products', (event, arg) => {
  if (!arg) {
    return
  }
  productsData.forEach(product => {
    if (arg[1].cat == product[0]) {
      product[1].push(arg)
    }
  });
 
})

ipcRenderer.on('return-products-update', (event, arg) => {
  if (!arg) {
    return
  }

  document.getElementById('namecell'+arg[0]).innerHTML = arg[1].name;
  document.getElementById('pricecell'+arg[0]).innerHTML = arg[1].price;
  document.getElementById('invwarncell'+arg[0]).innerHTML = arg[1].invWarning;
  document.getElementById('desccell'+arg[0]).innerHTML = arg[1].desc;
  document.getElementById('invcell'+arg[0]).innerHTML = arg[1].inventory;

  if (arg[2]) {
    document.getElementById('row'+arg[0]).style.backgroundColor = arg[2].color
  }

  document.getElementById("edit"+arg[0]).addEventListener('click', function(){
    productEditing = arg[0];
    editProductCategory.value = arg[1].cat
    editProductName.value = arg[1].name
    editProductBarcode.value = arg[1].barcode
    editProductPrice.value = arg[1].price
    editProductInvWarning.value = arg[1].invWarning
    editProductFavorite.checked = arg[1].favorite
    editProductTaxable.checked = arg[1].taxable
    editProductActive.checked = arg[1].active
    editProductCore.checked = arg[1].core
    editProductRental.checked = arg[1].rental
    editProductMembership.checked = arg[1].membership
    editProductDesc.value = arg[1].desc
    editProductInventory.value = arg[1].inventory
    editProductInventoryPar.value = arg[1].inventoryPar
    if (arg[1].image) {
      productImg.setAttribute('src', arg[1].image)
    }
  })
})

ipcRenderer.on('return-products-remove', (event, arg) => {
  if (!arg) {
    return
  }
  document.getElementById('row'+arg[0]).remove();
})

ipcRenderer.on('return-discounts', (event, arg) => {
  if (!arg) {
    return
  }
  var row = discountsTable.insertRow(1);
  row.id = 'row'+arg[0];

  var cell1 = row.insertCell(0);
  cell1.id = 'codecell'+arg[0];
  var cell2 = row.insertCell(1);
  cell2.id = 'dollarorpercentcell'+arg[0];
  var cell21 = row.insertCell(2);
  cell21.id = 'dtype'+arg[0];
  var cell3 = row.insertCell(3);
  cell3.id = 'amountcell'+arg[0];
  var cell4 = row.insertCell(4);
  cell4.id = 'expirecell'+arg[0];
  var cell5 = row.insertCell(5);
  cell5.id = 'actioncell'+arg[0];

  cell1.innerHTML = arg[1].code;
  if (arg[1].dollar) {
    cell2.innerHTML = 'Dollar';
  }else if (arg[1].percent) {
    cell2.innerHTML = 'Percent';
  }else{
    cell2.innerHTML = 'Error';
  }

  if (arg[1].typeProduct) {
    cell21.innerHTML = 'Product Discount';
  }else if (arg[1].typeOrder) {
    cell21.innerHTML = 'Order Discount';
  } else {
    cell21.innerHTML = 'Error';
  }

  cell3.innerHTML = arg[1].amount;
  if (arg[1].expires) {
    cell4.innerHTML = timeConverter((arg[1].expires / 1000));
  }else{
    cell4.innerHTML = 'N/A'
  }
  cell5.innerHTML = "<button data-bs-toggle='modal' data-bs-target='#myModal8' id='edit"+arg[0]+"' type='button' class='btn btn-warning'>Edit Discount</button> <button id='remove" +arg[0] + "' data-bs-toggle='modal' data-bs-target='#myModal9' type='button' class='btn btn-danger'>Remove Discount</button>";

  document.getElementById("edit"+arg[0]).addEventListener('click', function(){
    discountEditing = arg[0];
    editDiscountCode.value = arg[1].code
    editDiscountAmount.value = arg[1].amount
    editAsCheck.checked = arg[1].asCheck
    if (arg[1].asCheck) {
      editAsProSec.style.display = ''
      editAsPro.value = arg[1].asPro
    }else{
      editAsPro.value = ""
    }
    if (arg[1].dollar) {
      editDiscountDollar.checked = true;
    }else if (arg[1].percent) {
      editDiscountPercent.checked = true;
    }
    if (arg[1].typeProduct) {
      editDiscountTypeP.checked = true;
    }else if (arg[1].typeOrder) {
      editDiscountTypeO.checked = true;
    }
    if (arg[1].limit) {
      editDiscountUses.value = arg[1].limit
    }
    editDiscountUsed.value = arg[1].used
    if (arg[1].expires) {
      editDiscountExpDate.value = timeConverter2(arg[1].expires / 1000)
    }
//    editCategoryName.value = arg[1].name
//    editCategoryDescription.value = arg[1].desc
//    editCategoryColor.value = arg[1].color
  })

  document.getElementById("remove"+arg[0]).addEventListener('click', function(){
    discountEditing = arg[0];
  })
})

ipcRenderer.on('return-discounts-remove', (event, arg) => {
  if (!arg) {
    return
  }
  document.getElementById('row'+arg[0]).remove();
})
