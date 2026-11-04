<?php

declare(strict_types=1);

namespace MagentoHackathon\ReusableProductImages\Controller\Adminhtml\Product;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Catalog\Model\ResourceModel\Product\Gallery;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\EntityManager\MetadataPool;

/**
 * Searches products by SKU or name that have at least one gallery image.
 *
 * GET reusableimages/product/productchooser?q=<term>&exclude=<current product id>
 */
class ProductChooser extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'MagentoHackathon_ReusableProductImages::reuse';

    private const MIN_QUERY_LENGTH = 2;
    private const LIMIT = 20;

    public function __construct(
        Context $context,
        private readonly JsonFactory $jsonFactory,
        private readonly ProductCollectionFactory $productCollectionFactory,
        private readonly MetadataPool $metadataPool,
        private readonly ImageHelper $imageHelper
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        $result = $this->jsonFactory->create();
        $query = trim((string) $this->getRequest()->getParam('q', ''));
        $excludeId = (int) $this->getRequest()->getParam('exclude', 0);

        if (mb_strlen($query) < self::MIN_QUERY_LENGTH) {
            return $result->setData(['items' => []]);
        }

        $items = [];
        /** @var Product $product */
        foreach ($this->getProducts($query, $excludeId) as $product) {
            $items[] = [
                'id' => (int) $product->getId(),
                'sku' => (string) $product->getSku(),
                'name' => (string) $product->getName(),
                'image_count' => (int) $product->getData('reusable_image_count'),
                'thumbnail' => $this->imageHelper->init($product, 'product_listing_thumbnail')->getUrl(),
            ];
        }

        return $result->setData(['items' => $items]);
    }

    private function getProducts(string $query, int $excludeId): iterable
    {
        $like = '%' . addcslashes($query, '\\%_') . '%';

        $collection = $this->productCollectionFactory->create();
        $collection->addAttributeToSelect(['name', 'thumbnail'])
            ->addAttributeToFilter([
                ['attribute' => 'sku', 'like' => $like],
                ['attribute' => 'name', 'like' => $like],
            ])
            ->setOrder('sku', 'ASC')
            ->setPageSize(self::LIMIT)
            ->setCurPage(1);

        if ($excludeId > 0) {
            $collection->addFieldToFilter('entity_id', ['neq' => $excludeId]);
        }

        $linkField = $this->metadataPool->getMetadata(ProductInterface::class)->getLinkField();
        $connection = $collection->getConnection();
        $imageCount = $connection->select()
            ->from(
                ['rpi_link' => $collection->getTable(Gallery::GALLERY_VALUE_TO_ENTITY_TABLE)],
                [new \Zend_Db_Expr('COUNT(*)')]
            )
            ->join(
                ['rpi_gallery' => $collection->getTable(Gallery::GALLERY_TABLE)],
                'rpi_gallery.value_id = rpi_link.value_id',
                []
            )
            ->where('rpi_gallery.media_type = ?', 'image')
            ->where(sprintf('rpi_link.%1$s = e.%1$s', $linkField));

        $collection->getSelect()
            ->columns(['reusable_image_count' => new \Zend_Db_Expr('(' . $imageCount . ')')])
            ->where('(' . $imageCount . ') > 0');

        return $collection;
    }
}
