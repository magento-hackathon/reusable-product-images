<?php

declare(strict_types=1);

namespace MagentoHackathon\ReusableProductImages\Plugin;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Gallery\CreateHandler;
use Magento\Catalog\Model\ResourceModel\Product\Gallery;
use Magento\Catalog\Model\ResourceModel\Product\MediaGalleryValue;
use Magento\Framework\EntityManager\MetadataPool;
use Magento\Framework\Exception\LocalizedException;
use Magento\Store\Model\Store;

/**
 * Links images that were picked from another product's gallery to the product being saved.
 *
 * The core gallery handler treats every image without a value_id as a fresh upload and tries to move it
 * out of the tmp directory. A reused image is not in tmp: it already lives in pub/media/catalog/product.
 * Before the core handler runs, this plugin creates a gallery row for each reused image that points at the
 * existing file, links it to the product and fills in the value_id. Core then handles the image like any
 * existing one (labels, position, roles).
 *
 * Every product gets its own gallery row, so removing the image from one product only deletes that row.
 * Core deletes the file only when no gallery row uses it any more (UpdateHandler::canDeleteImage).
 */
class LinkReusedGalleryImages
{
    /** Form field that the admin JS adds to images taken from another product */
    public const REUSE_FLAG = 'reused';

    public function __construct(
        private readonly Gallery $galleryResource,
        private readonly MediaGalleryValue $mediaGalleryValue,
        private readonly MetadataPool $metadataPool
    ) {
    }

    /**
     * @param CreateHandler $subject
     * @param Product $product
     * @param array $arguments
     * @return array
     * @throws LocalizedException
     */
    public function beforeExecute(CreateHandler $subject, $product, $arguments = []): array
    {
        if ($product->getIsDuplicate()) {
            return [$product, $arguments];
        }

        $attribute = $subject->getAttribute();
        $attributeCode = $attribute->getAttributeCode();
        $value = $product->getData($attributeCode);
        if (!is_array($value) || empty($value['images'])) {
            return [$product, $arguments];
        }

        $images = $value['images'];
        if (is_string($images)) {
            $images = json_decode($images, true);
        }
        if (!is_array($images) || !$this->hasReusedImages($images)) {
            return [$product, $arguments];
        }

        $linkField = $this->metadataPool->getMetadata(ProductInterface::class)->getLinkField();
        $linkId = (int) $product->getData($linkField);
        if ($linkId === 0) {
            return [$product, $arguments];
        }
        $storeId = (int) $product->getStoreId();

        foreach ($images as $key => $image) {
            if (!is_array($image) || empty($image[self::REUSE_FLAG])) {
                continue;
            }
            unset($image[self::REUSE_FLAG]);

            if (!empty($image['removed'])) {
                // Added and removed again before saving: nothing to link and nothing to delete
                unset($images[$key]);
                continue;
            }
            if (!empty($image['value_id'])) {
                $images[$key] = $image;
                continue;
            }

            $file = (string) ($image['file'] ?? '');
            if (!$this->isReusableFile($file)) {
                throw new LocalizedException(
                    __('The image "%1" can\'t be reused because it isn\'t part of any product gallery.', $file)
                );
            }

            $valueId = (int) $this->galleryResource->insertGallery([
                'value' => $file,
                'attribute_id' => $attribute->getAttributeId(),
                'media_type' => 'image',
            ]);
            $this->galleryResource->bindValueToEntity($valueId, $linkId);

            if ($storeId !== Store::DEFAULT_STORE_ID) {
                // Core only writes the default-scope row for images it considers new, so add it here
                $this->mediaGalleryValue->saveGalleryStoreValue([
                    'value_id' => $valueId,
                    'store_id' => Store::DEFAULT_STORE_ID,
                    $linkField => $linkId,
                    'label' => null,
                    'position' => isset($image['position']) ? (int) $image['position'] : null,
                    'disabled' => 0,
                ]);
            }

            $image['value_id'] = $valueId;
            $images[$key] = $image;
        }

        $value['images'] = $images;
        $product->setData($attributeCode, $value);

        return [$product, $arguments];
    }

    private function hasReusedImages(array $images): bool
    {
        foreach ($images as $image) {
            if (is_array($image) && !empty($image[self::REUSE_FLAG])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Only accept paths that are already used by a gallery, so the form can't be used to link arbitrary files.
     */
    private function isReusableFile(string $file): bool
    {
        return $file !== ''
            && str_starts_with($file, '/')
            && !str_contains($file, '..')
            && !str_ends_with($file, '.tmp')
            && $this->galleryResource->countImageUses($file) > 0;
    }
}
