# reusable-product-images
Module provides ability to reuse existing images for products avoiding image duplication.

## How it works

1. In the product form, open **Images And Videos** and click **Reuse Images From Another Product**.
2. Search a product by SKU or name (only products with images are listed) and select it.
3. Select the images you want, then either:
   - **Add Selected Images**: adds them to the current gallery, or
   - **Replace Current Images With Selected Images**: removes the images currently in the gallery (after a
     confirmation) and adds the selected ones. Videos are kept. The images get the same roles (base, small,
     thumbnail, ...) they have on the source product. Any of base, small and thumbnail that is still empty
     goes to the first image.

   Images already in the gallery are shown as selected but locked: adding skips them and replacing keeps them.
4. Save the product. Nothing is added or removed until you save.

The image files are not copied. On save, each reused image gets its own gallery row
(`catalog_product_entity_media_gallery`) that points to the existing file. Because every product has its own row,
removing an image from one product never affects another product. Magento deletes the file from disk only when
no gallery row uses it any more.

Access is controlled by the ACL resource `MagentoHackathon_ReusableProductImages::reuse`
(Catalog > Inventory > Products > Reuse Images From Other Products).

## Files

- `view/adminhtml/ui_component/product_form.xml` + `templates/helper/reuse-images-button.phtml`: the button
- `view/adminhtml/web/js/reuse-images.js`: slide-out, search and adding images to the gallery widget
- `Controller/Adminhtml/Product/ProductChooser.php`: JSON product search (`?q=&exclude=`)
- `Controller/Adminhtml/Product/UseGallery.php`: JSON list of a product's gallery images (`?id=`)
- `Plugin/LinkReusedGalleryImages.php`: links reused images to the product on save
