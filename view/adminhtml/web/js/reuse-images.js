/**
 * "Reuse Images From Another Product" button in the product form gallery.
 *
 * Opens a slide-out where the admin searches a product by SKU or name and picks images from its gallery. The
 * images are either added to the gallery of the current product, or replace the images currently in it.
 * They are added with their existing file path and a hidden "reused" flag. On save,
 * Plugin\LinkReusedGalleryImages links the existing file instead of expecting an upload.
 */
define([
    'jquery',
    'mage/translate',
    'Magento_Ui/js/modal/confirm',
    'Magento_Ui/js/modal/modal'
], function ($, $t, confirm) {
    'use strict';

    $.widget('magentoHackathon.reuseProductImages', {
        options: {
            searchUrl: '',
            imagesUrl: '',
            excludeId: 0,
            minQueryLength: 2,
            searchDelay: 300,
            gallerySelector: '.gallery',
            imageSelector: '[data-role="image"]',
            // Roles that are given to the first image after a replace when no selected image has them
            requiredRoles: ['image', 'small_image', 'thumbnail']
        },

        _create: function () {
            this.searchTimer = null;
            this.request = null;
            this.images = [];
            this.gallery = this.element.closest(this.options.gallerySelector);

            this._clipUploadArea();
            this._moveNextToVideoButton();
            this._buildModal();
            this._on({
                click: function (event) {
                    event.preventDefault();
                    this.open();
                }
            });
        },

        /**
         * The upload placeholder ("Browse to find or drag image here") contains an invisible div#fileUploader of
         * about 1000x1000px. The core uploader opens the file picker on any click on it, so it catches clicks
         * on everything around the placeholder, including this button. Clip it to the placeholder's own box.
         * This is done here instead of in LESS so it doesn't depend on the admin styles being recompiled.
         */
        _clipUploadArea: function () {
            this.gallery.find('.image-placeholder').css('overflow', 'hidden');
        },

        /**
         * The ProductVideo gallery template can only render our button inside the gallery ("additional_buttons"),
         * while "Add Video" is rendered just above it. Move the button next to "Add Video". If that button
         * isn't there (e.g. ProductVideo disabled), leave it where it was rendered.
         */
        _moveNextToVideoButton: function () {
            var container = this.element.closest('.reuse-images-button-container'),
                videoButton = this.gallery.prev().find('[data-role="add-video-button"]');

            if (!videoButton.length) {
                return;
            }

            // The space keeps the two inline buttons apart, like whitespace between them in a template would
            videoButton.before(this.element, document.createTextNode(' '));
            container.remove();
        },

        open: function () {
            this._showSearch();
            this.modal.modal('openModal');
            this.searchInput.trigger('focus');
        },

        _buildModal: function () {
            var self = this;

            this.modal = $('<div class="reuse-images-modal"></div>');

            this.searchView = $('<div class="reuse-images-search-view"></div>').appendTo(this.modal);
            this.searchInput = $('<input type="search" class="admin__control-text reuse-images-search">')
                .attr({
                    placeholder: $t('Search by SKU or product name'),
                    'aria-label': $t('Search by SKU or product name')
                })
                .appendTo($('<div class="admin__field reuse-images-search-field"></div>').appendTo(this.searchView));
            this.searchMessage = $('<p class="reuse-images-message" role="status"></p>').appendTo(this.searchView);
            this.productList = $('<ul class="reuse-images-products"></ul>').appendTo(this.searchView);

            this.galleryView = $('<div class="reuse-images-gallery-view"></div>').hide().appendTo(this.modal);
            $('<div class="reuse-images-gallery-header"></div>')
                .append(
                    $('<button type="button" class="action-tertiary reuse-images-back"></button>')
                        .text($t('Back to search'))
                        .on('click', this._showSearch.bind(this))
                )
                .append(this.galleryTitle = $('<strong class="reuse-images-gallery-title"></strong>'))
                .append(
                    $('<label class="reuse-images-select-all"></label>')
                        .append(this.selectAll = $('<input type="checkbox" class="admin__control-checkbox">'))
                        .append($('<span></span>').text($t('Select all')))
                )
                .appendTo(this.galleryView);
            this.galleryMessage = $('<p class="reuse-images-message" role="status"></p>').appendTo(this.galleryView);
            this.imageGrid = $('<ul class="reuse-images-grid"></ul>').appendTo(this.galleryView);

            this.searchInput.on('input', function () {
                clearTimeout(self.searchTimer);
                self.searchTimer = setTimeout(self._search.bind(self), self.options.searchDelay);
            });
            this.selectAll.on('change', function () {
                self.imageGrid.find('input:checkbox:enabled').prop('checked', this.checked);
                self._updateButtons();
            });
            this.imageGrid.on('change', 'input:checkbox', this._updateButtons.bind(this));

            this.modal.modal({
                type: 'slide',
                title: $t('Reuse Images From Another Product'),
                modalClass: 'reuse-images-slide',
                buttons: [{
                    text: $t('Cancel'),
                    class: 'action-secondary',
                    click: function () {
                        this.closeModal();
                    }
                }, {
                    text: $t('Replace Current Images With Selected Images'),
                    class: 'action-secondary reuse-images-replace',
                    click: function () {
                        self._confirmReplace(this.closeModal.bind(this));
                    }
                }, {
                    text: $t('Add Selected Images'),
                    class: 'action-primary reuse-images-add',
                    click: function () {
                        self._addSelected();
                        this.closeModal();
                    }
                }]
            });
            this.addButton = this.modal.closest('.modal-slide').find('.reuse-images-add');
            this.replaceButton = this.modal.closest('.modal-slide').find('.reuse-images-replace');
        },

        _showSearch: function () {
            this.galleryView.hide();
            this.searchView.show();
            this.addButton.prop('disabled', true);
            this.replaceButton.prop('disabled', true);
        },

        _search: function () {
            var query = $.trim(this.searchInput.val());

            this._abort();
            this.productList.empty();

            if (query.length < this.options.minQueryLength) {
                this.searchMessage.text('');
                return;
            }

            this.searchMessage.text($t('Searching...'));
            // The admin sets POST as the default for $.ajax, so the method has to be explicit
            this.request = $.ajax({
                url: this.options.searchUrl,
                type: 'GET',
                data: {q: query, exclude: this.options.excludeId},
                dataType: 'json'
            }).done(function (response) {
                var items = response.items || [];

                this.searchMessage.text(items.length ? '' : $t('No products with images found.'));
                items.forEach(this._renderProduct.bind(this));
            }.bind(this)).fail(this._requestFailed.bind(this, this.searchMessage));
        },

        _renderProduct: function (product) {
            var button = $('<button type="button" class="reuse-images-product"></button>')
                .append($('<img alt="" loading="lazy">').attr('src', product.thumbnail))
                .append(
                    $('<span class="reuse-images-product-info"></span>')
                        .append($('<span class="reuse-images-product-name"></span>').text(product.name))
                        .append($('<span class="reuse-images-product-sku"></span>').text(product.sku))
                )
                .append(
                    $('<span class="reuse-images-product-count"></span>')
                        .text(product.image_count === 1 ? $t('1 image') : $t('%1 images').replace('%1', product.image_count))
                )
                .on('click', this._loadImages.bind(this, product));

            $('<li></li>').append(button).appendTo(this.productList);
        },

        _loadImages: function (product) {
            this._abort();
            this.searchView.hide();
            this.galleryView.show();
            this.galleryTitle.text(product.name + ' (' + product.sku + ')');
            this.imageGrid.empty();
            this.selectAll.prop('checked', false);
            this.galleryMessage.text($t('Loading images...'));
            this._updateButtons();

            this.request = $.ajax({
                url: this.options.imagesUrl,
                type: 'GET',
                data: {id: product.id},
                dataType: 'json'
            }).done(function (response) {
                this.images = response.images || [];
                this.galleryMessage.text(this.images.length ? '' : $t('This product has no images.'));
                this.images.forEach(this._renderImage.bind(this));
                this.selectAll.prop('checked', this.imageGrid.find('input:checkbox:enabled').length > 0);
                this._updateButtons();
            }.bind(this)).fail(this._requestFailed.bind(this, this.galleryMessage));
        },

        _renderImage: function (image, index) {
            var alreadyAdded = this._isInGallery(image.file),
                id = 'reuse-image-' + this.uuid + '-' + index,
                item = $('<li class="reuse-images-item"></li>').toggleClass('_added', alreadyAdded);

            // Images that are already in the gallery are shown as selected but locked: "add" skips them and
            // "replace" keeps them
            $('<input type="checkbox" class="admin__control-checkbox">')
                .attr({id: id, value: index})
                .prop({checked: true, disabled: alreadyAdded})
                .appendTo(item);
            $('<label></label>')
                .attr('for', id)
                .append($('<img loading="lazy">').attr({src: image.url, alt: image.label || ''}))
                .append(
                    $('<span class="reuse-images-item-label"></span>')
                        .text(alreadyAdded ? $t('Already in this gallery') : image.label || image.file.split('/').pop())
                )
                .appendTo(item);

            item.appendTo(this.imageGrid);
        },

        _updateButtons: function () {
            this.addButton.prop('disabled', this._selectedImages(false).length === 0);
            this.replaceButton.prop('disabled', this._selectedImages(true).length === 0);
        },

        /**
         * @param {Boolean} includeExisting - also return selected images that are already in the gallery
         * @return {Array}
         */
        _selectedImages: function (includeExisting) {
            var self = this;

            return this.imageGrid
                .find(includeExisting ? 'input:checkbox:checked' : 'input:checkbox:checked:enabled')
                .map(function () {
                    return self.images[$(this).val()];
                })
                .get();
        },

        _addSelected: function () {
            this._selectedImages(false).forEach(this._addImage.bind(this));
        },

        _addImage: function (image) {
            if (this._isInGallery(image.file)) {
                return;
            }

            // Same event the core uploader triggers after an upload
            this.gallery.trigger('addItem', {
                file: image.file,
                url: image.url,
                label: image.label,
                size: image.size,
                'media_type': 'image',
                disabled: 0
            });
            this._flagAsReused(image.file);
        },

        /**
         * Nothing is deleted until the product is saved, but ask first because it removes every image at once.
         *
         * @param {Function} closeSlideOut
         */
        _confirmReplace: function (closeSlideOut) {
            var self = this,
                toRemove = this._imagesToReplace().length;

            if (toRemove === 0) {
                this._replaceWithSelected();
                closeSlideOut();
                return;
            }

            confirm({
                title: $t('Replace current images?'),
                content: (toRemove === 1 ?
                    $t('1 image will be removed from this product.') :
                    $t('%1 images will be removed from this product.').replace('%1', toRemove)) +
                    ' ' + $t('Nothing is deleted until you save the product.'),
                actions: {
                    confirm: function () {
                        self._replaceWithSelected();
                        closeSlideOut();
                    }
                }
            });
        },

        /**
         * Current gallery images that a replace removes: all images (not videos) that aren't selected.
         *
         * @return {jQuery}
         */
        _imagesToReplace: function () {
            var keep = this._selectedImages(true).map(function (image) {
                return image.file;
            });

            return this.gallery.find(this.options.imageSelector).not('.removed').filter(function () {
                var data = $(this).data('imageData') || {};

                return data['media_type'] !== 'external-video' && keep.indexOf(data.file) === -1;
            });
        },

        _replaceWithSelected: function () {
            var self = this,
                selected = this._selectedImages(true);

            // Same event as the gallery's delete button. It also resets all roles to "no selection".
            this._imagesToReplace().each(function () {
                self.gallery.trigger('removeItem', $(this).data('imageData'));
            });

            selected.forEach(this._addImage.bind(this));
            this._applyRoles(selected);
        },

        /**
         * Give the images the roles (base, small, thumbnail, ...) they have on the source product. Required roles
         * that are still empty go to the first image, so the product always has a base image.
         *
         * @param {Array} images
         */
        _applyRoles: function (images) {
            var self = this;

            if (!images.length) {
                return;
            }

            images.forEach(function (image) {
                (image.roles || []).forEach(function (role) {
                    self._setRole(role, image.file);
                });
            });

            this.options.requiredRoles.forEach(function (role) {
                var input = self.gallery.find('input.image-' + role);

                if (input.length && (!input.val() || input.val() === 'no_selection')) {
                    self._setRole(role, images[0].file);
                }
            });
        },

        _setRole: function (role, file) {
            var item = this._galleryItems(file).not('.removed').first();

            // Only roles the gallery knows (it renders a hidden input per role)
            if (!item.length || !this.gallery.find('input.image-' + role).length) {
                return;
            }

            this.gallery.trigger('setImageType', {type: role, imageData: item.data('imageData')});
            // On store view scope, stop using the default value for this role, like the core "set base" does
            this.gallery.find('input[type="hidden"][name="use_default[' + role + ']"]').val('0');
        },

        /**
         * Add the hidden "reused" field next to the "file" field of the new gallery item, using the same
         * field name prefix so the product form sends it along with the image.
         */
        _flagAsReused: function (file) {
            this._galleryItems(file).each(function () {
                var item = $(this),
                    fileInput = item.find('input[name$="[file]"]');

                if ((item.data('imageData') || {})['value_id'] || item.find('[data-role="reuse-flag"]').length) {
                    return;
                }

                $('<input type="hidden" value="1" data-role="reuse-flag">')
                    .attr({
                        name: fileInput.attr('name').replace(/\[file\]$/, '[reused]'),
                        'data-form-part': fileInput.attr('data-form-part')
                    })
                    .insertAfter(fileInput);
            });
        },

        _isInGallery: function (file) {
            return this._galleryItems(file).not('.removed').length > 0;
        },

        _galleryItems: function (file) {
            return this.gallery.find(this.options.imageSelector).filter(function () {
                return ($(this).data('imageData') || {}).file === file;
            });
        },

        _abort: function () {
            if (this.request && this.request.readyState !== 4) {
                this.request.abort();
            }
            this.request = null;
        },

        _requestFailed: function (messageElement, xhr, status) {
            if (status === 'abort') {
                return;
            }
            messageElement.text(
                xhr.responseJSON && xhr.responseJSON.message ?
                    xhr.responseJSON.message :
                    $t('Something went wrong. Please try again.')
            );
        }
    });

    return $.magentoHackathon.reuseProductImages;
});
