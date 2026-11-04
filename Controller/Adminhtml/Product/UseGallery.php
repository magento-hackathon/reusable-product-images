<?php

declare(strict_types=1);

namespace MagentoHackathon\ReusableProductImages\Controller\Adminhtml\Product;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\Product\Media\Config as MediaConfig;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Filesystem;
use Magento\Store\Model\Store;

/**
 * Returns the gallery images of one product so they can be reused on another product.
 *
 * GET reusableimages/product/usegallery?id=<product id>
 */
class UseGallery extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'MagentoHackathon_ReusableProductImages::reuse';

    public function __construct(
        Context $context,
        private readonly JsonFactory $jsonFactory,
        private readonly ProductRepositoryInterface $productRepository,
        private readonly MediaConfig $mediaConfig,
        private readonly Filesystem $filesystem
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        $result = $this->jsonFactory->create();
        $productId = (int) $this->getRequest()->getParam('id', 0);

        try {
            $product = $this->productRepository->getById($productId, false, Store::DEFAULT_STORE_ID);
        } catch (NoSuchEntityException) {
            return $result->setHttpResponseCode(404)
                ->setData(['message' => (string) __('The product no longer exists.')]);
        }

        $mediaDirectory = $this->filesystem->getDirectoryRead(DirectoryList::MEDIA);
        $images = [];
        foreach ($product->getMediaGalleryEntries() ?? [] as $entry) {
            if ($entry->getMediaType() !== 'image' || !$entry->getFile()) {
                continue;
            }
            $file = $entry->getFile();
            $path = $this->mediaConfig->getMediaPath($file);

            $images[] = [
                'file' => $file,
                'url' => $this->mediaConfig->getMediaUrl($file),
                'label' => (string) $entry->getLabel(),
                'position' => (int) $entry->getPosition(),
                'disabled' => (bool) $entry->isDisabled(),
                'roles' => array_values($entry->getTypes() ?? []),
                'size' => $mediaDirectory->isFile($path) ? (int) ($mediaDirectory->stat($path)['size'] ?? 0) : 0,
            ];
        }

        usort($images, static fn (array $a, array $b): int => $a['position'] <=> $b['position']);

        return $result->setData([
            'product' => [
                'id' => (int) $product->getId(),
                'sku' => (string) $product->getSku(),
                'name' => (string) $product->getName(),
            ],
            'images' => $images,
        ]);
    }
}
