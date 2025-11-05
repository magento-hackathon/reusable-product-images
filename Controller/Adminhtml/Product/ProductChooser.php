<?php

namespace MagentoHackathon\ReusableProductImages\Controller\Adminhtml\Product;

use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Request\DataPersistorInterface;

class ProductChooser extends \Magento\Backend\App\Action
{
    public function __construct(
        Context $context,
        protected DataPersistorInterface $dataPersistor,
        protected ProductRepositoryInterface $productRepository,
        protected ProductCollectionFactory $productCollectionFactory
    )
    {
        parent::__construct($context);
    }

    public function execute()
    {
        $data = $this->getRequest()->getPostValue();
        if ($data) {
            $sku = $this->getRequest()->getParam('sku');
            $collection = $this->getProductsBySku($sku);
            if(count($collection) == 0){
                return null;
            } elseif(count($collection) > 1){
                $list = [];
                foreach ($collection as $product) {
                    $list[] = $product->getSku();
                }
                return $list;
            } elseif(count($collection) == 1){
                return $collection[0]->getId();
//                $imageUrls = [];
//                $product = $this->productRepository->get($collection[0]->getSku());
//                try {
//                    $images = $product->getMediaGalleryImages();
//                    if ($images && $images->getSize()) {
//                        foreach ($images as $image) {
//                            $imageUrls[] = $image->getUrl();
//                        }
//                    }
//                } catch (\Exception $e) {
//                   //
//                }
//                return $imageUrls;
            }
        }
    }

    public function getProductsBySku($sku)
    {
        $collection = $this->productCollectionFactory->create()
            ->addAttributeToSelect('*')
            ->addAttributeToFilter('sku', ['like' => "%$sku%"]);

        return $collection;
    }
}
